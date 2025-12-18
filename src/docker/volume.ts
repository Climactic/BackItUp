/**
 * Docker volume operations
 */

import { logger } from "../utils/logger";
import { dockerRun } from "./client";

export interface DockerVolume {
  name: string;
  driver: string;
  mountpoint: string;
  labels: Record<string, string>;
  scope: string;
  createdAt: string;
}

export interface VolumeContainer {
  id: string;
  name: string;
  state: string;
}

/**
 * List all Docker volumes
 */
export async function listVolumes(): Promise<DockerVolume[]> {
  const result = await dockerRun(["volume", "ls", "--format", "{{json .}}"]);

  if (!result.success) {
    logger.error("Failed to list Docker volumes", result.stderr);
    return [];
  }

  if (!result.stdout) {
    return [];
  }

  const volumes: DockerVolume[] = [];
  const lines = result.stdout.split("\n").filter(Boolean);

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      // Basic info from ls, we'll get full details from inspect if needed
      volumes.push({
        name: parsed.Name,
        driver: parsed.Driver,
        mountpoint: parsed.Mountpoint || "",
        labels: {},
        scope: parsed.Scope || "local",
        createdAt: "",
      });
    } catch {
      logger.debug(`Failed to parse volume JSON: ${line}`);
    }
  }

  return volumes;
}

/**
 * Get detailed information about a specific volume
 */
export async function inspectVolume(name: string): Promise<DockerVolume | null> {
  const result = await dockerRun(["volume", "inspect", name]);

  if (!result.success) {
    logger.debug(`Volume not found or error: ${name}`, result.stderr);
    return null;
  }

  try {
    const parsed = JSON.parse(result.stdout);
    const volumeData = Array.isArray(parsed) ? parsed[0] : parsed;

    return {
      name: volumeData.Name,
      driver: volumeData.Driver,
      mountpoint: volumeData.Mountpoint,
      labels: volumeData.Labels || {},
      scope: volumeData.Scope,
      createdAt: volumeData.CreatedAt,
    };
  } catch {
    logger.error(`Failed to parse volume inspect output for ${name}`);
    return null;
  }
}

/**
 * Check if a volume exists
 */
export async function volumeExists(name: string): Promise<boolean> {
  const result = await dockerRun(["volume", "inspect", name]);
  return result.success;
}

/**
 * Get containers that are using a specific volume
 */
export async function getVolumeContainers(volumeName: string): Promise<VolumeContainer[]> {
  // Get all containers (running and stopped) that have this volume mounted
  const result = await dockerRun([
    "ps",
    "-a",
    "--filter",
    `volume=${volumeName}`,
    "--format",
    "{{json .}}",
  ]);

  if (!result.success) {
    logger.error(`Failed to get containers for volume ${volumeName}`, result.stderr);
    return [];
  }

  if (!result.stdout) {
    return [];
  }

  const containers: VolumeContainer[] = [];
  const lines = result.stdout.split("\n").filter(Boolean);

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      containers.push({
        id: parsed.ID,
        name: parsed.Names,
        state: parsed.State,
      });
    } catch {
      logger.debug(`Failed to parse container JSON: ${line}`);
    }
  }

  return containers;
}

/**
 * Check if a volume is currently mounted by any running container
 */
export async function isVolumeInUse(volumeName: string): Promise<boolean> {
  const containers = await getVolumeContainers(volumeName);
  return containers.some((c) => c.state === "running");
}

/**
 * Get running containers that have a volume mounted
 */
export async function getRunningContainersUsingVolume(
  volumeName: string,
): Promise<VolumeContainer[]> {
  const containers = await getVolumeContainers(volumeName);
  return containers.filter((c) => c.state === "running");
}

/**
 * Validate that all specified volumes exist
 */
export async function validateVolumes(
  volumeNames: string[],
): Promise<{ valid: string[]; invalid: string[] }> {
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const name of volumeNames) {
    if (await volumeExists(name)) {
      valid.push(name);
    } else {
      invalid.push(name);
    }
  }

  return { valid, invalid };
}
