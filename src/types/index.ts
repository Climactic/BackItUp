/**
 * Centralized type exports for BackItUp
 */

// Backup types
export type {
  ArchiveResult,
  BackupOptions,
  BackupResult,
  CollectedFile,
  CollectFilesResult,
  VolumeBackupResult,
  VolumeBackupsResult,
} from "./backup";
// Config types
export type {
  ArchiveConfig,
  BackitupConfig,
  DatabaseConfig,
  DockerConfig,
  DockerVolumeSource,
  LocalStorageConfig,
  RetentionConfig,
  S3StorageConfig,
  SafetyConfig,
  ScheduleConfig,
  SourceConfig,
} from "./config";
// Database types
export type {
  BackupInsert,
  BackupRecord,
  BackupStatus,
  BackupType,
  DeletionLogRecord,
  DeletionReason,
  DeletionType,
} from "./database";
// Storage types
export type { IStorageProvider, SaveResult, StorageLocation, StorageType } from "./storage";
