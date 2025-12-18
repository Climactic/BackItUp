/**
 * Docker volume backup implementation
 */

import * as os from "node:os";
import * as path from "node:path";
import {
  ensureImage,
  isDockerAvailable,
  runContainer,
} from "../../docker/client";
import { inferProjectName, resolveServiceVolumes } from "../../docker/compose";
import {
  getRunningContainersUsingVolume,
  isVolumeInUse,
  volumeExists,
} from "../../docker/volume";
import type {
  VolumeBackupResult,
  VolumeBackupsResult,
} from "../../types/backup";
import type { DockerConfig, DockerVolumeSource } from "../../types/config";
import { computeFileChecksum } from "../../utils/crypto";
import { logger } from "../../utils/logger";

const BACKUP_IMAGE = "alpine:latest";

/**
 * Generate archive name for a volume backup
 */
function generateVolumeArchiveName(
  volumeName: string,
  schedule: string,
  prefix: string,
): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  // Sanitize volume name for use in filename
  const sanitizedName = volumeName.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${prefix}-volume-${sanitizedName}-${schedule}-${timestamp}.tar.gz`;
}

/**
 * Backup a single Docker volume
 */
export async function backupVolume(
  volumeName: string,
  outputDir: string,
  schedule: string,
  prefix: string,
): Promise<VolumeBackupResult> {
  logger.info(`Backing up Docker volume: ${volumeName}`);

  // Check if volume exists
  if (!(await volumeExists(volumeName))) {
    throw new Error(`Docker volume not found: ${volumeName}`);
  }

  // Check if volume is in use
  const inUse = await isVolumeInUse(volumeName);
  const containersUsingVolume: string[] = [];

  if (inUse) {
    const containers = await getRunningContainersUsingVolume(volumeName);
    containersUsingVolume.push(...containers.map((c) => c.name));
    logger.warn(
      `Volume ${volumeName} is in use by running containers: ${containersUsingVolume.join(", ")}. ` +
        "Backup may be inconsistent.",
    );
  }

  // Generate archive name
  const archiveName = generateVolumeArchiveName(volumeName, schedule, prefix);

  // Ensure Alpine image is available
  await ensureImage(BACKUP_IMAGE);

  // Create the tar archive using a temporary container
  // Mount the volume as read-only and output dir for the archive
  const result = await runContainer({
    image: BACKUP_IMAGE,
    command: ["tar", "-czf", `/backup/${archiveName}`, "-C", "/source", "."],
    volumes: [
      { source: volumeName, target: "/source", readonly: true },
      { source: outputDir, target: "/backup", readonly: false },
    ],
  });

  if (!result.success) {
    throw new Error(
      `Failed to backup volume ${volumeName}: ${result.stderr || result.stdout}`,
    );
  }

  const archivePath = path.join(outputDir, archiveName);

  // Get file size
  const file = Bun.file(archivePath);
  const sizeBytes = file.size;

  // Compute checksum
  const checksum = await computeFileChecksum(archivePath);

  logger.info(
    `Volume ${volumeName} backed up: ${archiveName} (${sizeBytes} bytes)`,
  );

  return {
    volumeName,
    archivePath,
    archiveName,
    sizeBytes,
    checksum,
    wasInUse: inUse,
    containersUsingVolume,
  };
}

/**
 * Resolve volume sources to actual Docker volume names
 */
export async function resolveVolumeNames(
  sources: DockerVolumeSource[],
): Promise<string[]> {
  const volumeNames: string[] = [];

  for (const source of sources) {
    if (source.type === "compose" && source.composePath) {
      // Resolve volumes from docker-compose.yml
      const projectName =
        source.projectName || inferProjectName(source.composePath);
      const resolved = await resolveServiceVolumes(
        source.composePath,
        source.name,
        projectName,
      );
      volumeNames.push(...resolved);
    } else {
      // Direct volume name
      volumeNames.push(source.name);
    }
  }

  // Remove duplicates
  return [...new Set(volumeNames)];
}

/**
 * Backup all configured Docker volumes
 */
export async function backupAllVolumes(
  dockerConfig: DockerConfig,
  schedule: string,
  prefix: string,
): Promise<VolumeBackupsResult> {
  if (!dockerConfig.enabled) {
    return {
      volumes: [],
      totalSizeBytes: 0,
      volumesInUseCount: 0,
    };
  }

  // Check Docker availability
  if (!(await isDockerAvailable())) {
    throw new Error("Docker is not available. Cannot backup volumes.");
  }

  // Resolve all volume names
  const volumeNames = await resolveVolumeNames(dockerConfig.volumes);

  if (volumeNames.length === 0) {
    logger.info("No Docker volumes configured for backup");
    return {
      volumes: [],
      totalSizeBytes: 0,
      volumesInUseCount: 0,
    };
  }

  logger.info(`Backing up ${volumeNames.length} Docker volume(s)`);

  // Create temp directory for volume backups
  const tempDir = path.join(os.tmpdir(), `backitup-volumes-${Date.now()}`);
  await Bun.$`mkdir -p ${tempDir}`.quiet();

  const results: VolumeBackupResult[] = [];
  let totalSizeBytes = 0;
  let volumesInUseCount = 0;

  try {
    for (const volumeName of volumeNames) {
      try {
        const result = await backupVolume(
          volumeName,
          tempDir,
          schedule,
          prefix,
        );
        results.push(result);
        totalSizeBytes += result.sizeBytes;
        if (result.wasInUse) {
          volumesInUseCount++;
        }
      } catch (error) {
        logger.error(`Failed to backup volume ${volumeName}:`, error);
        // Continue with other volumes
      }
    }
  } catch (error) {
    // Cleanup on error
    await Bun.$`rm -rf ${tempDir}`.quiet();
    throw error;
  }

  return {
    volumes: results,
    totalSizeBytes,
    volumesInUseCount,
  };
}

/**
 * Cleanup temporary volume backup files
 */
export async function cleanupVolumeBackups(
  results: VolumeBackupsResult,
): Promise<void> {
  for (const volume of results.volumes) {
    try {
      await Bun.$`rm -f ${volume.archivePath}`.quiet();
    } catch {
      logger.debug(`Failed to cleanup ${volume.archivePath}`);
    }
  }

  // Try to remove the temp directory if empty
  if (results.volumes.length > 0 && results.volumes[0]) {
    const tempDir = path.dirname(results.volumes[0].archivePath);
    try {
      await Bun.$`rmdir ${tempDir}`.quiet();
    } catch {
      // Directory not empty or already removed
    }
  }
}
