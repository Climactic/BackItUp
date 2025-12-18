/**
 * Backup record repository
 */

import type { BackupInsert, BackupRecord } from "../types";
import { getDatabase } from "./connection";
import {
  parseBackupRow,
  type RawBackupRow,
  serializeSourcePaths,
} from "./mappers";

export function insertBackup(backup: BackupInsert): BackupRecord {
  const database = getDatabase();

  const stmt = database.prepare(`
    INSERT INTO backups (
      backup_id, schedule_name, archive_name, archive_size_bytes,
      archive_checksum, files_count, local_path, s3_bucket, s3_key, source_paths,
      backup_type, volume_name, volume_was_in_use
    ) VALUES ($backup_id, $schedule_name, $archive_name, $archive_size_bytes,
      $archive_checksum, $files_count, $local_path, $s3_bucket, $s3_key, $source_paths,
      $backup_type, $volume_name, $volume_was_in_use)
  `);

  stmt.run({
    $backup_id: backup.backup_id,
    $schedule_name: backup.schedule_name,
    $archive_name: backup.archive_name,
    $archive_size_bytes: backup.archive_size_bytes,
    $archive_checksum: backup.archive_checksum,
    $files_count: backup.files_count,
    $local_path: backup.local_path ?? null,
    $s3_bucket: backup.s3_bucket ?? null,
    $s3_key: backup.s3_key ?? null,
    $source_paths: serializeSourcePaths(backup.source_paths),
    $backup_type: backup.backup_type ?? "files",
    $volume_name: backup.volume_name ?? null,
    $volume_was_in_use: backup.volume_was_in_use ? 1 : 0,
  });

  const inserted = getBackupById(backup.backup_id);
  if (!inserted) {
    throw new Error(`Failed to retrieve inserted backup: ${backup.backup_id}`);
  }
  return inserted;
}

export function getBackupById(backupId: string): BackupRecord | null {
  const database = getDatabase();
  const row = database
    .query("SELECT * FROM backups WHERE backup_id = $id")
    .get({ $id: backupId }) as RawBackupRow | null;

  if (!row) return null;
  return parseBackupRow(row);
}

export function getActiveBackupsBySchedule(
  scheduleName: string,
): BackupRecord[] {
  const database = getDatabase();
  const rows = database
    .query(`
      SELECT * FROM backups
      WHERE schedule_name = $schedule AND status = 'active'
      ORDER BY created_at DESC
    `)
    .all({ $schedule: scheduleName }) as RawBackupRow[];

  return rows.map(parseBackupRow);
}

export function getAllActiveBackups(): BackupRecord[] {
  const database = getDatabase();
  const rows = database
    .query(
      `SELECT * FROM backups WHERE status = 'active' ORDER BY created_at DESC`,
    )
    .all() as RawBackupRow[];

  return rows.map(parseBackupRow);
}

export function updateBackupLocalPath(
  backupId: string,
  localPath: string,
): void {
  const database = getDatabase();
  database.run(
    "UPDATE backups SET local_path = ? WHERE backup_id = ?",
    [localPath, backupId],
  );
}

export function updateBackupS3(
  backupId: string,
  bucket: string,
  key: string,
): void {
  const database = getDatabase();
  database.run(
    "UPDATE backups SET s3_bucket = ?, s3_key = ? WHERE backup_id = ?",
    [bucket, key, backupId],
  );
}

export function getActiveVolumeBackups(): BackupRecord[] {
  const database = getDatabase();
  const rows = database
    .query(
      `SELECT * FROM backups WHERE status = 'active' AND backup_type = 'volume' ORDER BY created_at DESC`,
    )
    .all() as RawBackupRow[];

  return rows.map(parseBackupRow);
}

export function getActiveVolumeBackupsBySchedule(
  scheduleName: string,
): BackupRecord[] {
  const database = getDatabase();
  const rows = database
    .query(`
      SELECT * FROM backups
      WHERE schedule_name = $schedule AND status = 'active' AND backup_type = 'volume'
      ORDER BY created_at DESC
    `)
    .all({ $schedule: scheduleName }) as RawBackupRow[];

  return rows.map(parseBackupRow);
}

export function getActiveBackupsByType(
  backupType: "files" | "volume",
): BackupRecord[] {
  const database = getDatabase();
  const rows = database
    .query(`
      SELECT * FROM backups
      WHERE status = 'active' AND backup_type = $type
      ORDER BY created_at DESC
    `)
    .all({ $type: backupType }) as RawBackupRow[];

  return rows.map(parseBackupRow);
}

export function markBackupDeleted(
  backupId: string,
  deletionType: "local" | "s3" | "both",
): void {
  const database = getDatabase();

  if (deletionType === "local" || deletionType === "both") {
    database.run(
      "UPDATE backups SET local_deleted_at = datetime('now') WHERE backup_id = ?",
      [backupId],
    );
  }

  if (deletionType === "s3" || deletionType === "both") {
    database.run(
      "UPDATE backups SET s3_deleted_at = datetime('now') WHERE backup_id = ?",
      [backupId],
    );
  }

  const backup = getBackupById(backupId);
  if (backup) {
    const localGone = !backup.local_path || backup.local_deleted_at;
    const s3Gone = !backup.s3_key || backup.s3_deleted_at;

    if (localGone && s3Gone) {
      database.run(
        "UPDATE backups SET status = 'deleted' WHERE backup_id = ?",
        [backupId],
      );
    }
  }
}
