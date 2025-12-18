/**
 * Cleanup orchestration
 */

import { getActiveBackupsBySchedule, initDatabase, logDeletion, markBackupDeleted } from "../../db";
import { deleteFromLocal, localFileExists } from "../../storage/local";
import { deleteFromS3, initS3Client, s3ObjectExists } from "../../storage/s3";
import type { BackitupConfig, DeletionReason } from "../../types";
import { logger } from "../../utils/logger";
import { getCleanupCandidates } from "./retention";
import { validateDeletionCandidate } from "./validator";

export interface CleanupOptions {
  schedule?: string;
  dryRun?: boolean;
  force?: boolean;
}

export interface CleanupResult {
  totalChecked: number;
  totalDeleted: number;
  totalSkipped: number;
  deletions: {
    backupId: string;
    archiveName: string;
    reason: string;
    localDeleted: boolean;
    s3Deleted: boolean;
    success: boolean;
    error?: string;
  }[];
}

export async function runCleanup(
  config: BackitupConfig,
  options: CleanupOptions,
): Promise<CleanupResult> {
  initDatabase(config.database.path);

  if (config.s3.enabled) {
    initS3Client(config.s3);
  }

  const result: CleanupResult = {
    totalChecked: 0,
    totalDeleted: 0,
    totalSkipped: 0,
    deletions: [],
  };

  const schedulesToClean = options.schedule ? [options.schedule] : Object.keys(config.schedules);

  for (const scheduleName of schedulesToClean) {
    const scheduleConfig = config.schedules[scheduleName];
    if (!scheduleConfig) {
      logger.warn(`Schedule "${scheduleName}" not found in config, skipping`);
      continue;
    }

    logger.info(`Checking cleanup for schedule: ${scheduleName}`);

    const backups = getActiveBackupsBySchedule(scheduleName);
    result.totalChecked += backups.length;

    if (backups.length === 0) {
      logger.debug(`No backups found for schedule: ${scheduleName}`);
      continue;
    }

    const candidates = getCleanupCandidates(backups, scheduleConfig.retention);

    logger.info(
      `Found ${candidates.length} backup(s) eligible for cleanup in schedule "${scheduleName}"`,
    );

    for (const { backup, reason } of candidates) {
      logger.debug(`Checking backup: ${backup.archive_name} (reason: ${reason})`);

      const validation = await validateDeletionCandidate(backup, config);

      if (!validation.valid) {
        logger.error(`Validation failed for ${backup.backup_id}: ${validation.errors.join(", ")}`);
        result.totalSkipped++;
        result.deletions.push({
          backupId: backup.backup_id,
          archiveName: backup.archive_name,
          reason,
          localDeleted: false,
          s3Deleted: false,
          success: false,
          error: validation.errors.join("; "),
        });
        continue;
      }

      if (validation.warnings.length > 0) {
        logger.warn(`Warnings for ${backup.backup_id}: ${validation.warnings.join(", ")}`);
      }

      if (options.dryRun) {
        logger.info(`[DRY RUN] Would delete: ${backup.archive_name} (${reason})`);
        result.deletions.push({
          backupId: backup.backup_id,
          archiveName: backup.archive_name,
          reason,
          localDeleted: false,
          s3Deleted: false,
          success: true,
        });
        continue;
      }

      const deletion = await executeDelete(backup, config, reason);

      if (deletion.success) {
        result.totalDeleted++;
        logger.info(`Deleted: ${backup.archive_name} (${reason})`);
      } else {
        result.totalSkipped++;
      }

      result.deletions.push(deletion);
    }
  }

  return result;
}

async function executeDelete(
  backup: {
    backup_id: string;
    archive_name: string;
    local_path: string | null;
    local_deleted_at: string | null;
    s3_bucket: string | null;
    s3_key: string | null;
    s3_deleted_at: string | null;
  },
  _config: BackitupConfig,
  reason: DeletionReason,
): Promise<{
  backupId: string;
  archiveName: string;
  reason: DeletionReason;
  localDeleted: boolean;
  s3Deleted: boolean;
  success: boolean;
  error?: string;
}> {
  let localDeleted = false;
  let s3Deleted = false;
  let deletionError: string | undefined;

  try {
    if (backup.local_path && !backup.local_deleted_at) {
      const exists = await localFileExists(backup.local_path);
      if (exists) {
        await deleteFromLocal(backup.local_path);
      }
      localDeleted = true;
    }

    if (backup.s3_key && backup.s3_bucket && !backup.s3_deleted_at) {
      const exists = await s3ObjectExists(backup.s3_key);
      if (exists) {
        await deleteFromS3(backup.s3_bucket, backup.s3_key);
      }
      s3Deleted = true;
    }

    const deletionType =
      localDeleted && s3Deleted ? "both" : localDeleted ? "local" : s3Deleted ? "s3" : "both";
    markBackupDeleted(backup.backup_id, deletionType);

    logDeletion({
      backup_id: backup.backup_id,
      deletion_type: deletionType,
      local_path: backup.local_path,
      s3_bucket: backup.s3_bucket,
      s3_key: backup.s3_key,
      reason,
      success: true,
      error_message: null,
    });
  } catch (error) {
    deletionError = (error as Error).message;
    logger.error(`Failed to delete ${backup.archive_name}: ${deletionError}`);

    logDeletion({
      backup_id: backup.backup_id,
      deletion_type: "both",
      local_path: backup.local_path,
      s3_bucket: backup.s3_bucket,
      s3_key: backup.s3_key,
      reason,
      success: false,
      error_message: deletionError,
    });
  }

  return {
    backupId: backup.backup_id,
    archiveName: backup.archive_name,
    reason,
    localDeleted,
    s3Deleted,
    success: !deletionError,
    error: deletionError,
  };
}
