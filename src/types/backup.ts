/**
 * Backup operation type definitions
 */

import type { SourceConfig } from "./config";

export interface BackupOptions {
  schedule: string;
  sources?: SourceConfig[];
  sourceNames?: string[];
  dryRun?: boolean;
  localOnly?: boolean;
  s3Only?: boolean;
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
}

export interface ArchiveResult {
  archiveName: string;
  archivePath: string;
  sizeBytes: number;
  filesCount: number;
  checksum: string;
  sourcePaths: string[];
}

export interface CollectedFile {
  absolutePath: string;
  relativePath: string;
}

export interface CollectFilesResult {
  files: CollectedFile[];
  sourcePaths: string[];
}

/**
 * Result of backing up a single Docker volume
 */
export interface VolumeBackupResult {
  /** Name of the Docker volume that was backed up */
  volumeName: string;
  /** Path to the created archive */
  archivePath: string;
  /** Name of the archive file */
  archiveName: string;
  /** Size of the archive in bytes */
  sizeBytes: number;
  /** SHA256 checksum of the archive */
  checksum: string;
  /** Whether the volume was in use by running containers during backup */
  wasInUse: boolean;
  /** Names of containers that had the volume mounted during backup */
  containersUsingVolume: string[];
  /** Names of containers that were stopped for this backup */
  stoppedContainers?: string[];
  /** Names of containers that failed to restart after backup */
  failedToRestart?: string[];
  /** Whether any stopped containers had auto-restart policy (restart: always/unless-stopped) */
  hadAutoRestartWarning?: boolean;
}

/**
 * Result of backing up all configured Docker volumes
 */
export interface VolumeBackupsResult {
  /** Results for each volume backed up */
  volumes: VolumeBackupResult[];
  /** Total size of all volume archives */
  totalSizeBytes: number;
  /** Number of volumes that were in use during backup */
  volumesInUseCount: number;
}
