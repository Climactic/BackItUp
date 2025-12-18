/**
 * Configuration type definitions for BackItUp
 */

export interface SourceConfig {
  path: string;
  patterns?: string[];
  s3Prefix?: string;
}

export interface LocalStorageConfig {
  enabled: boolean;
  path: string;
}

export interface S3StorageConfig {
  enabled: boolean;
  bucket: string;
  prefix?: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export interface RetentionConfig {
  maxCount: number;
  maxDays: number;
}

export interface ScheduleConfig {
  cron: string;
  retention: RetentionConfig;
  sources?: string[];
}

export interface SafetyConfig {
  dryRun: boolean;
  verifyChecksumBeforeDelete: boolean;
}

export interface ArchiveConfig {
  prefix?: string;
  compression?: number;
}

export interface DatabaseConfig {
  path: string;
}

/**
 * Docker volume source configuration
 */
export interface DockerVolumeSource {
  /** Volume name or compose service name */
  name: string;
  /** Type of source: direct volume name or compose service */
  type?: "volume" | "compose";
  /** Path to docker-compose.yml (required if type is 'compose') */
  composePath?: string;
  /** Docker Compose project name (optional, inferred from directory if not set) */
  projectName?: string;
}

/**
 * Docker volume backup configuration
 */
export interface DockerConfig {
  /** Enable Docker volume backups */
  enabled: boolean;
  /** List of volumes to backup */
  volumes: DockerVolumeSource[];
}

export interface BackitupConfig {
  version: string;
  database: DatabaseConfig;
  sources: Record<string, SourceConfig>;
  local: LocalStorageConfig;
  s3: S3StorageConfig;
  schedules: Record<string, ScheduleConfig>;
  archive?: ArchiveConfig;
  safety?: SafetyConfig;
  docker?: DockerConfig;
}
