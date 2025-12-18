/**
 * Database row mapping utilities
 */

import type { BackupRecord, BackupType } from "../types";

export type RawBackupRow = Omit<
  BackupRecord,
  "source_paths" | "volume_was_in_use"
> & {
  source_paths: string;
  volume_was_in_use: number;
};

export function parseBackupRow(row: RawBackupRow): BackupRecord {
  return {
    ...row,
    source_paths: JSON.parse(row.source_paths),
    backup_type: (row.backup_type || "files") as BackupType,
    volume_was_in_use: Boolean(row.volume_was_in_use),
  };
}

export function serializeSourcePaths(paths: string[]): string {
  return JSON.stringify(paths);
}
