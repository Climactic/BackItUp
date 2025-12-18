/**
 * Backup deletion validation
 */

import { getBackupById } from "../../db";
import {
  getLocalFileChecksum,
  isPathWithinDir,
  localFileExists,
} from "../../storage/local";
import { isKeyWithinPrefix, s3ObjectExists } from "../../storage/s3";
import type { BackitupConfig, BackupRecord } from "../../types";
import { isValidArchiveName } from "../../utils/naming";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a backup candidate for deletion.
 * This is the CRITICAL security function - it performs all safety checks.
 */
export async function validateDeletionCandidate(
  backup: BackupRecord,
  config: BackitupConfig,
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // CHECK 1: Verify backup exists in our database (re-fetch to be sure)
  const dbRecord = getBackupById(backup.backup_id);
  if (!dbRecord) {
    errors.push(
      `Backup ${backup.backup_id} not found in database - REFUSING TO DELETE`,
    );
    return { valid: false, errors, warnings };
  }

  // CHECK 2: Verify archive naming pattern matches our convention
  const archivePrefix = config.archive?.prefix ?? "backitup";
  if (!isValidArchiveName(backup.archive_name, archivePrefix)) {
    errors.push(
      `Archive name "${backup.archive_name}" doesn't match ${archivePrefix} pattern - REFUSING TO DELETE`,
    );
    return { valid: false, errors, warnings };
  }

  // CHECK 3: For local files, verify path is within configured backup directory
  if (backup.local_path && !backup.local_deleted_at) {
    if (!isPathWithinDir(backup.local_path, config.local.path)) {
      errors.push(
        `Local path "${backup.local_path}" is outside configured backup directory "${config.local.path}" - REFUSING TO DELETE`,
      );
      return { valid: false, errors, warnings };
    }

    // CHECK 4: Verify local file exists
    const exists = await localFileExists(backup.local_path);
    if (!exists) {
      warnings.push(
        `Local file not found (already deleted?): ${backup.local_path}`,
      );
    } else if (config.safety?.verifyChecksumBeforeDelete) {
      // CHECK 5: Verify checksum matches
      const actualChecksum = await getLocalFileChecksum(backup.local_path);
      if (actualChecksum && actualChecksum !== backup.archive_checksum) {
        errors.push(
          `Checksum mismatch for "${backup.local_path}" - REFUSING TO DELETE (file may have been modified)`,
        );
        return { valid: false, errors, warnings };
      }
    }
  }

  // CHECK 6: For S3 files, verify key matches expected pattern and bucket
  if (backup.s3_key && !backup.s3_deleted_at) {
    if (!isKeyWithinPrefix(backup.s3_key, config.s3.prefix)) {
      errors.push(
        `S3 key "${backup.s3_key}" doesn't start with configured prefix "${config.s3.prefix}" - REFUSING TO DELETE`,
      );
      return { valid: false, errors, warnings };
    }

    if (backup.s3_bucket !== config.s3.bucket) {
      errors.push(
        `S3 bucket "${backup.s3_bucket}" doesn't match configured bucket "${config.s3.bucket}" - REFUSING TO DELETE`,
      );
      return { valid: false, errors, warnings };
    }

    // CHECK 7: Verify S3 object exists
    const exists = await s3ObjectExists(backup.s3_key);
    if (!exists) {
      warnings.push(
        `S3 object not found (already deleted?): s3://${backup.s3_bucket}/${backup.s3_key}`,
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
