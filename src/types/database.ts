/**
 * Database record type definitions
 */

export type BackupStatus = "active" | "deleted";
export type BackupType = "files" | "volume";
export type DeletionType = "local" | "s3" | "both";
export type DeletionReason = "retention_count" | "retention_days" | "manual";

export interface BackupRecord {
  id: number;
  backup_id: string;
  schedule_name: string;
  archive_name: string;
  archive_size_bytes: number;
  archive_checksum: string;
  files_count: number;
  local_path: string | null;
  local_deleted_at: string | null;
  s3_bucket: string | null;
  s3_key: string | null;
  s3_deleted_at: string | null;
  created_at: string;
  source_paths: string[];
  status: BackupStatus;
  backup_type: BackupType;
  volume_name: string | null;
  volume_was_in_use: boolean;
}

export interface DeletionLogRecord {
  id: number;
  backup_id: string;
  deletion_type: DeletionType;
  local_path: string | null;
  s3_bucket: string | null;
  s3_key: string | null;
  reason: DeletionReason;
  deleted_at: string;
  success: boolean;
  error_message: string | null;
}

export interface BackupInsert {
  backup_id: string;
  schedule_name: string;
  archive_name: string;
  archive_size_bytes: number;
  archive_checksum: string;
  files_count: number;
  local_path?: string;
  s3_bucket?: string;
  s3_key?: string;
  source_paths: string[];
  backup_type?: BackupType;
  volume_name?: string;
  volume_was_in_use?: boolean;
}

export interface Migration {
  version: number;
  name: string;
  description: string;
  up: string;
}
