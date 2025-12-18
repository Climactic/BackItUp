/**
 * Docker Compose volume resolution support
 */

import * as yaml from "js-yaml";
import { logger } from "../utils/logger";
import { volumeExists } from "./volume";

export interface ComposeService {
  name: string;
  volumes: ComposeVolumeMount[];
}

export interface ComposeVolumeMount {
  source: string;
  target: string;
  type: "volume" | "bind" | "tmpfs";
  readOnly: boolean;
}

export interface ComposeFile {
  version?: string;
  services: Record<string, ComposeServiceDefinition>;
  volumes?: Record<string, ComposeVolumeDefinition | null>;
}

interface ComposeServiceDefinition {
  volumes?: Array<string | ComposeVolumeLongSyntax>;
  [key: string]: unknown;
}

interface ComposeVolumeLongSyntax {
  type?: string;
  source?: string;
  target: string;
  read_only?: boolean;
}

interface ComposeVolumeDefinition {
  driver?: string;
  external?: boolean;
  name?: string;
  [key: string]: unknown;
}

/**
 * Parse a docker-compose.yml file
 */
export async function parseComposeFile(composePath: string): Promise<ComposeFile | null> {
  try {
    const file = Bun.file(composePath);
    const content = await file.text();
    const parsed = yaml.load(content) as ComposeFile;

    if (!parsed.services) {
      logger.error(`No services found in compose file: ${composePath}`);
      return null;
    }

    return parsed;
  } catch (error) {
    logger.error(`Failed to parse compose file: ${composePath}`, error);
    return null;
  }
}

/**
 * Parse a volume mount string (short syntax)
 * Formats: "volume_name:/path" or "./host/path:/path" or "/host/path:/path"
 */
function parseVolumeShortSyntax(volumeString: string): ComposeVolumeMount | null {
  const parts = volumeString.split(":");

  if (parts.length < 2) {
    return null;
  }

  const source = parts[0]!;
  const target = parts[1]!;
  const options = parts[2] || "";

  // Determine if this is a named volume or a bind mount
  const isBindMount = source.startsWith("./") || source.startsWith("/") || source.startsWith("~");

  return {
    source,
    target,
    type: isBindMount ? "bind" : "volume",
    readOnly: options.includes("ro"),
  };
}

/**
 * Get all volume mounts for a service
 */
export function getServiceVolumes(
  composeFile: ComposeFile,
  serviceName: string,
): ComposeVolumeMount[] {
  const service = composeFile.services[serviceName];

  if (!service || !service.volumes) {
    return [];
  }

  const mounts: ComposeVolumeMount[] = [];

  for (const volumeSpec of service.volumes) {
    if (typeof volumeSpec === "string") {
      // Short syntax: "volume_name:/path" or "./path:/path"
      const mount = parseVolumeShortSyntax(volumeSpec);
      if (mount) {
        mounts.push(mount);
      }
    } else {
      // Long syntax object
      mounts.push({
        source: volumeSpec.source || "",
        target: volumeSpec.target,
        type: (volumeSpec.type as "volume" | "bind" | "tmpfs") || "volume",
        readOnly: volumeSpec.read_only || false,
      });
    }
  }

  return mounts;
}

/**
 * Get named volumes used by a service (excludes bind mounts)
 */
export function getServiceNamedVolumes(composeFile: ComposeFile, serviceName: string): string[] {
  const mounts = getServiceVolumes(composeFile, serviceName);
  return mounts.filter((m) => m.type === "volume" && m.source).map((m) => m.source);
}

/**
 * Resolve the actual Docker volume name for a compose volume
 * Docker Compose prefixes volumes with the project name
 */
export async function resolveComposeVolumeName(
  volumeName: string,
  composeFile: ComposeFile,
  projectName?: string,
): Promise<string | null> {
  // Check if the volume is defined as external
  const volumeDef = composeFile.volumes?.[volumeName];

  if (volumeDef?.external) {
    // External volumes use their defined name
    return volumeDef.name || volumeName;
  }

  // For non-external volumes, Docker Compose prefixes with project name
  // Try common patterns
  const candidates: string[] = [];

  if (projectName) {
    candidates.push(`${projectName}_${volumeName}`);
  }

  // Always try the raw name (might be external or user specified full name)
  candidates.push(volumeName);

  // Try to find a matching volume
  for (const candidate of candidates) {
    if (await volumeExists(candidate)) {
      return candidate;
    }
  }

  logger.warn(`Could not resolve Docker volume for compose volume: ${volumeName}`);
  return null;
}

/**
 * Resolve all volumes for a compose service to actual Docker volume names
 */
export async function resolveServiceVolumes(
  composePath: string,
  serviceName: string,
  projectName?: string,
): Promise<string[]> {
  const composeFile = await parseComposeFile(composePath);

  if (!composeFile) {
    return [];
  }

  const namedVolumes = getServiceNamedVolumes(composeFile, serviceName);
  const resolved: string[] = [];

  for (const volumeName of namedVolumes) {
    const dockerVolumeName = await resolveComposeVolumeName(volumeName, composeFile, projectName);

    if (dockerVolumeName) {
      resolved.push(dockerVolumeName);
    }
  }

  return resolved;
}

/**
 * Get all named volumes defined in a compose file
 */
export function getComposeVolumes(composeFile: ComposeFile): string[] {
  if (!composeFile.volumes) {
    return [];
  }
  return Object.keys(composeFile.volumes);
}

/**
 * Infer project name from compose file path
 * Docker Compose uses the directory name as the default project name
 */
export function inferProjectName(composePath: string): string {
  const parts = composePath.split("/");
  // Get the directory containing the compose file
  const dirName = parts[parts.length - 2] || "default";
  // Docker Compose converts to lowercase and removes special chars
  return dirName.toLowerCase().replace(/[^a-z0-9]/g, "");
}
