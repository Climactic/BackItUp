/**
 * Docker volume backup implementation
 */

import * as os from "node:os";
import * as path from "node:path";
import { ensureImage, isDockerAvailable, runContainer } from "../../docker/client";
import { inferProjectName, resolveServiceVolumes } from "../../docker/compose";
import {
  getRunningContainersUsingVolume,
  isVolumeInUse,
  restartContainers,
  stopContainersUsingVolume,
  volumeExists,
  type StoppedContainer,
} from "../../docker/volume";
import type { VolumeBackupResult, VolumeBackupsResult } from "../../types/backup";
import type { ContainerStopConfig, DockerConfig, DockerVolumeSource } from "../../types/config";
import { computeFileChecksum } from "../../utils/crypto";
import { logger } from "../../utils/logger";

const BACKUP_IMAGE = "alpine:latest";

/**
 * Default values for container stop configuration
 */
const DEFAULT_CONTAINER_STOP_CONFIG = {
  stopContainers: false,
  stopTimeout: 30,
  restartRetries: 3,
  restartRetryDelay: 1000,
};

/**
 * Resolved container stop configuration with all defaults filled in
 */
interface ResolvedContainerStopConfig {
  stopContainers: boolean;
  stopTimeout: number;
  restartRetries: number;
  restartRetryDelay: number;
}

/**
 * Resolve container stop config with per-volume overrides taking precedence
 */
function resolveContainerStopConfig(
  globalConfig: ContainerStopConfig | undefined,
  volumeConfig: ContainerStopConfig | undefined,
): ResolvedContainerStopConfig {
  return {
    stopContainers:
      volumeConfig?.stopContainers ??
      globalConfig?.stopContainers ??
      DEFAULT_CONTAINER_STOP_CONFIG.stopContainers,
    stopTimeout:
      volumeConfig?.stopTimeout ??
      globalConfig?.stopTimeout ??
      DEFAULT_CONTAINER_STOP_CONFIG.stopTimeout,
    restartRetries:
      volumeConfig?.restartRetries ??
      globalConfig?.restartRetries ??
      DEFAULT_CONTAINER_STOP_CONFIG.restartRetries,
    restartRetryDelay:
      volumeConfig?.restartRetryDelay ??
      globalConfig?.restartRetryDelay ??
      DEFAULT_CONTAINER_STOP_CONFIG.restartRetryDelay,
  };
}

/**
 * Generate archive name for a volume backup
 */
function generateVolumeArchiveName(volumeName: string, schedule: string, prefix: string): string {
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
  containerStopConfig?: ResolvedContainerStopConfig,
): Promise<VolumeBackupResult> {
  logger.info(`Backing up Docker volume: ${volumeName}`);

  // Check if volume exists
  if (!(await volumeExists(volumeName))) {
    throw new Error(`Docker volume not found: ${volumeName}`);
  }

  // Check if volume is in use
  const inUse = await isVolumeInUse(volumeName);
  const containersUsingVolume: string[] = [];
  let stoppedContainers: StoppedContainer[] = [];
  let failedToRestart: string[] = [];
  let hadAutoRestartWarning = false;

  if (inUse) {
    const containers = await getRunningContainersUsingVolume(volumeName);
    containersUsingVolume.push(...containers.map((c) => c.name));

    // Should we stop containers?
    if (containerStopConfig?.stopContainers) {
      logger.info(
        `Stopping ${containers.length} container(s) using volume ${volumeName} before backup...`,
      );

      const stopResult = await stopContainersUsingVolume(
        volumeName,
        containerStopConfig.stopTimeout,
      );
      stoppedContainers = stopResult.stopped;
      hadAutoRestartWarning = stoppedContainers.some((c) => c.hadAutoRestartPolicy);

      if (stopResult.failed.length > 0) {
        logger.warn(
          `Failed to stop some containers: ${stopResult.failed.join(", ")}. ` +
            "Backup may be inconsistent.",
        );
      }
    } else {
      logger.warn(
        `Volume ${volumeName} is in use by running containers: ${containersUsingVolume.join(", ")}. ` +
          "Backup may be inconsistent. Use --stop-containers to stop them before backup.",
      );
    }
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
    // If we stopped containers, try to restart them even on failure
    if (stoppedContainers.length > 0 && containerStopConfig) {
      logger.info("Backup failed, attempting to restart stopped containers...");
      await restartContainers(
        stoppedContainers,
        containerStopConfig.restartRetries,
        containerStopConfig.restartRetryDelay,
      );
    }
    throw new Error(`Failed to backup volume ${volumeName}: ${result.stderr || result.stdout}`);
  }

  const archivePath = path.join(outputDir, archiveName);

  // Get file size
  const file = Bun.file(archivePath);
  const sizeBytes = file.size;

  // Compute checksum
  const checksum = await computeFileChecksum(archivePath);

  logger.info(`Volume ${volumeName} backed up: ${archiveName} (${sizeBytes} bytes)`);

  // Restart containers if we stopped them
  if (stoppedContainers.length > 0 && containerStopConfig) {
    logger.info(`Restarting ${stoppedContainers.length} container(s)...`);
    const restartResult = await restartContainers(
      stoppedContainers,
      containerStopConfig.restartRetries,
      containerStopConfig.restartRetryDelay,
    );
    failedToRestart = restartResult.failed;
  }

  return {
    volumeName,
    archivePath,
    archiveName,
    sizeBytes,
    checksum,
    wasInUse: inUse,
    containersUsingVolume,
    stoppedContainers: stoppedContainers.map((c) => c.name),
    failedToRestart: failedToRestart.length > 0 ? failedToRestart : undefined,
    hadAutoRestartWarning: hadAutoRestartWarning || undefined,
  };
}

/**
 * Resolved volume with its source config for per-volume settings
 */
interface ResolvedVolume {
  name: string;
  source: DockerVolumeSource;
}

/**
 * Resolve volume sources to actual Docker volume names with their source configs
 */
export async function resolveVolumes(sources: DockerVolumeSource[]): Promise<ResolvedVolume[]> {
  const resolved: ResolvedVolume[] = [];
  const seenNames = new Set<string>();

  for (const source of sources) {
    if (source.type === "compose" && source.composePath) {
      // Resolve volumes from docker-compose.yml
      const projectName = source.projectName || inferProjectName(source.composePath);
      const volumeNames = await resolveServiceVolumes(source.composePath, source.name, projectName);
      for (const name of volumeNames) {
        if (!seenNames.has(name)) {
          seenNames.add(name);
          resolved.push({ name, source });
        }
      }
    } else {
      // Direct volume name
      if (!seenNames.has(source.name)) {
        seenNames.add(source.name);
        resolved.push({ name: source.name, source });
      }
    }
  }

  return resolved;
}

/**
 * Resolve volume sources to actual Docker volume names (backwards compatibility)
 */
export async function resolveVolumeNames(sources: DockerVolumeSource[]): Promise<string[]> {
  const resolved = await resolveVolumes(sources);
  return resolved.map((r) => r.name);
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

  // Resolve all volumes with their source configs
  const resolvedVolumes = await resolveVolumes(dockerConfig.volumes);

  if (resolvedVolumes.length === 0) {
    logger.info("No Docker volumes configured for backup");
    return {
      volumes: [],
      totalSizeBytes: 0,
      volumesInUseCount: 0,
    };
  }

  logger.info(`Backing up ${resolvedVolumes.length} Docker volume(s)`);

  // Create temp directory for volume backups
  const tempDir = path.join(os.tmpdir(), `backitup-volumes-${Date.now()}`);
  await Bun.$`mkdir -p ${tempDir}`.quiet();

  const results: VolumeBackupResult[] = [];
  let totalSizeBytes = 0;
  let volumesInUseCount = 0;

  try {
    for (const { name: volumeName, source } of resolvedVolumes) {
      try {
        // Resolve container stop config with per-volume overrides
        const containerStopConfig = resolveContainerStopConfig(
          dockerConfig.containerStop,
          source.containerStop,
        );

        const result = await backupVolume(
          volumeName,
          tempDir,
          schedule,
          prefix,
          containerStopConfig,
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
export async function cleanupVolumeBackups(results: VolumeBackupsResult): Promise<void> {
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
