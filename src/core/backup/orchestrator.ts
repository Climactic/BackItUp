/**
 * Backup orchestration
 */

import { getSourcesForSchedule } from "../../config/loader";
import { initDatabase, insertBackup, updateBackupLocalPath, updateBackupS3 } from "../../db";
import { saveToLocal } from "../../storage/local";
import { buildS3Key, initS3Client, uploadToS3 } from "../../storage/s3";
import type { BackitupConfig, BackupInsert, SourceConfig, VolumeBackupResult } from "../../types";
import { generateUUID } from "../../utils/crypto";
import { logger } from "../../utils/logger";
import { formatBytes, formatDuration } from "../../utils/naming";
import { cleanupTempArchive, createArchive } from "./archive-creator";
import { backupAllVolumes, cleanupVolumeBackups } from "./volume-backup";

/**
 * Determine S3 folder for file backups based on source configs and names.
 */
export function getSourceFolder(sources: SourceConfig[], sourceNames: string[]): string {
  // If single source with custom s3Prefix, use it
  if (sources.length === 1 && sources[0]?.s3Prefix) {
    return sources[0].s3Prefix;
  }
  // Otherwise use source names joined
  return sourceNames.join("-");
}

export interface BackupOptions {
  schedule: string;
  sources?: SourceConfig[];
  sourceNames?: string[];
  dryRun?: boolean;
  localOnly?: boolean;
  s3Only?: boolean;
  /** Skip file backup (only backup Docker volumes) */
  volumesOnly?: boolean;
  /** Skip Docker volume backup (only backup files) */
  skipVolumes?: boolean;
  /** Specific volume names to backup (if not set, backup all configured volumes) */
  volumes?: string[];
}

export interface BackupResult {
  backupId: string;
  archiveName: string;
  sizeBytes: number;
  filesCount: number;
  localPath: string | null;
  s3Bucket: string | null;
  s3Key: string | null;
  durationMs: number;
  /** Results from volume backups (if any) */
  volumeBackups?: VolumeBackupResult[];
}

export async function runBackup(
  config: BackitupConfig,
  options: BackupOptions,
): Promise<BackupResult> {
  const startTime = Date.now();
  const backupId = generateUUID();

  logger.info(`Starting backup: ${backupId} (schedule: ${options.schedule})`);

  initDatabase(config.database.path);

  const useS3 = config.s3.enabled && !options.localOnly;
  const useLocal = config.local.enabled && !options.s3Only;

  if (useS3) {
    initS3Client(config.s3);
  }

  if (!useLocal && !useS3) {
    throw new Error("At least one storage destination must be enabled");
  }

  const shouldBackupFiles = !options.volumesOnly;
  const shouldBackupVolumes =
    !options.skipVolumes && config.docker?.enabled && config.docker.volumes.length > 0;

  let archiveName = "";
  let sizeBytes = 0;
  let filesCount = 0;
  let localPath: string | null = null;
  let s3Bucket: string | null = null;
  let s3Key: string | null = null;
  const volumeBackups: VolumeBackupResult[] = [];

  // Backup files (unless volumesOnly)
  if (shouldBackupFiles) {
    const sources = options.sources ?? getSourcesForSchedule(config, options.schedule);
    const sourceNames =
      options.sourceNames ??
      (() => {
        const schedule = config.schedules[options.schedule];
        return schedule?.sources ?? Object.keys(config.sources);
      })();

    const archiveResult = await createArchive(
      sources,
      options.schedule,
      config.archive?.prefix ?? "backitup",
      config.archive?.compression ?? 6,
      sourceNames,
    );

    archiveName = archiveResult.archiveName;
    sizeBytes = archiveResult.sizeBytes;
    filesCount = archiveResult.filesCount;

    logger.info(
      `Archive created: ${archiveResult.archiveName} (${formatBytes(archiveResult.sizeBytes)}, ${archiveResult.filesCount} files)`,
    );

    if (!options.dryRun) {
      const backupRecord: BackupInsert = {
        backup_id: backupId,
        schedule_name: options.schedule,
        archive_name: archiveResult.archiveName,
        archive_size_bytes: archiveResult.sizeBytes,
        archive_checksum: archiveResult.checksum,
        files_count: archiveResult.filesCount,
        source_paths: archiveResult.sourcePaths,
        backup_type: "files",
      };

      insertBackup(backupRecord);

      try {
        if (useLocal) {
          localPath = await saveToLocal(
            archiveResult.archivePath,
            config.local.path,
            archiveResult.archiveName,
          );
          updateBackupLocalPath(backupId, localPath);
        }

        if (useS3) {
          const sourceFolder = getSourceFolder(sources, sourceNames);
          const s3Result = await uploadToS3(
            archiveResult.archivePath,
            config.s3,
            archiveResult.archiveName,
            sourceFolder,
          );
          s3Bucket = s3Result.bucket;
          s3Key = s3Result.key;
          updateBackupS3(backupId, s3Bucket, s3Key);
        }

        await cleanupTempArchive(archiveResult.archivePath);
      } catch (error) {
        await cleanupTempArchive(archiveResult.archivePath);
        throw error;
      }
    } else {
      logger.info("[DRY RUN] Would save archive but not actually saving");
      await cleanupTempArchive(archiveResult.archivePath);
      localPath = useLocal ? `${config.local.path}/${archiveResult.archiveName}` : null;
      s3Bucket = useS3 ? config.s3.bucket : null;
      s3Key = useS3
        ? buildS3Key(
            config.s3.prefix,
            getSourceFolder(sources, sourceNames),
            archiveResult.archiveName,
          )
        : null;
    }
  }

  // Backup Docker volumes
  if (shouldBackupVolumes && config.docker) {
    logger.info("Starting Docker volume backups...");

    const volumeResults = await backupAllVolumes(
      config.docker,
      options.schedule,
      config.archive?.prefix ?? "backitup",
    );

    if (!options.dryRun) {
      // Save each volume backup to storage and database
      for (const volResult of volumeResults.volumes) {
        const volumeBackupId = generateUUID();

        const volumeRecord: BackupInsert = {
          backup_id: volumeBackupId,
          schedule_name: options.schedule,
          archive_name: volResult.archiveName,
          archive_size_bytes: volResult.sizeBytes,
          archive_checksum: volResult.checksum,
          files_count: 0, // Volume backups don't have file counts
          source_paths: [volResult.volumeName],
          backup_type: "volume",
          volume_name: volResult.volumeName,
          volume_was_in_use: volResult.wasInUse,
        };

        insertBackup(volumeRecord);

        try {
          if (useLocal) {
            const volLocalPath = await saveToLocal(
              volResult.archivePath,
              config.local.path,
              volResult.archiveName,
            );
            updateBackupLocalPath(volumeBackupId, volLocalPath);
          }

          if (useS3) {
            const s3Result = await uploadToS3(
              volResult.archivePath,
              config.s3,
              volResult.archiveName,
              `volumes/${volResult.volumeName}`,
            );
            updateBackupS3(volumeBackupId, s3Result.bucket, s3Result.key);
          }
        } catch (error) {
          logger.error(`Failed to save volume backup ${volResult.volumeName}:`, error);
        }

        volumeBackups.push(volResult);
      }

      // Cleanup temp volume files
      await cleanupVolumeBackups(volumeResults);
    } else {
      logger.info("[DRY RUN] Would backup Docker volumes but not actually saving");
      volumeBackups.push(...volumeResults.volumes);
      await cleanupVolumeBackups(volumeResults);
    }

    if (volumeResults.volumesInUseCount > 0) {
      logger.warn(
        `${volumeResults.volumesInUseCount} volume(s) were in use during backup - data may be inconsistent`,
      );
    }

    logger.info(
      `Docker volume backups completed: ${volumeResults.volumes.length} volume(s), ${formatBytes(volumeResults.totalSizeBytes)} total`,
    );
  }

  const durationMs = Date.now() - startTime;
  logger.info(`Backup completed in ${formatDuration(durationMs)}: ${backupId}`);

  return {
    backupId,
    archiveName,
    sizeBytes,
    filesCount,
    localPath,
    s3Bucket,
    s3Key,
    durationMs,
    volumeBackups: volumeBackups.length > 0 ? volumeBackups : undefined,
  };
}
