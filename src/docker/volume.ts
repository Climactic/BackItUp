/**
 * Docker volume operations
 */

import { logger } from "../utils/logger";
import {
  dockerRun,
  getContainerRestartPolicy,
  hasAutoRestartPolicy,
  startContainerWithRetry,
  stopContainer,
} from "./client";

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

/**
 * Information about a container that was stopped for backup
 */
export interface StoppedContainer {
  /** Container ID */
  id: string;
  /** Container name */
  name: string;
  /** Whether the container had an auto-restart policy (always/unless-stopped) */
  hadAutoRestartPolicy: boolean;
}

/**
 * Result of stopping containers for a volume backup
 */
export interface StopContainersResult {
  /** Containers that were successfully stopped */
  stopped: StoppedContainer[];
  /** Container names that failed to stop */
  failed: string[];
}

/**
 * Result of restarting containers after a volume backup
 */
export interface RestartContainersResult {
  /** Container names that were successfully restarted */
  restarted: string[];
  /** Container names that failed to restart */
  failed: string[];
}

/**
 * Stop all running containers using a volume
 * @param volumeName - Name of the Docker volume
 * @param timeout - Timeout in seconds for graceful stop (default: 30)
 * @returns Result with stopped containers and any failures
 */
export async function stopContainersUsingVolume(
  volumeName: string,
  timeout: number = 30,
): Promise<StopContainersResult> {
  const runningContainers = await getRunningContainersUsingVolume(volumeName);

  if (runningContainers.length === 0) {
    return { stopped: [], failed: [] };
  }

  const stopped: StoppedContainer[] = [];
  const failed: string[] = [];

  for (const container of runningContainers) {
    // Check restart policy before stopping
    const restartPolicy = await getContainerRestartPolicy(container.id);
    const hadAutoRestart = restartPolicy ? hasAutoRestartPolicy(restartPolicy) : false;

    if (hadAutoRestart) {
      logger.warn(
        `Container "${container.name}" has restart policy "${restartPolicy}". ` +
          `It may auto-restart during backup. Consider using "restart: on-failure" or "restart: no".`,
      );
    }

    logger.info(`Stopping container "${container.name}" for volume backup...`);
    const success = await stopContainer(container.id, timeout);

    if (success) {
      stopped.push({
        id: container.id,
        name: container.name,
        hadAutoRestartPolicy: hadAutoRestart,
      });
    } else {
      failed.push(container.name);
    }
  }

  return { stopped, failed };
}

/**
 * Restart previously stopped containers
 * @param containers - List of containers to restart
 * @param retries - Number of retry attempts per container (default: 3)
 * @param retryDelay - Delay between retries in ms (default: 1000)
 * @returns Result with restarted containers and any failures
 */
export async function restartContainers(
  containers: StoppedContainer[],
  retries: number = 3,
  retryDelay: number = 1000,
): Promise<RestartContainersResult> {
  const restarted: string[] = [];
  const failed: string[] = [];

  for (const container of containers) {
    logger.info(`Restarting container "${container.name}"...`);
    const success = await startContainerWithRetry(container.id, retries, retryDelay);

    if (success) {
      restarted.push(container.name);
    } else {
      failed.push(container.name);
      logger.warn(
        `Failed to restart container "${container.name}" after ${retries} attempts. ` +
          `You may need to start it manually.`,
      );
    }
  }

  return { restarted, failed };
}
