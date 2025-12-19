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
 * Container stop/restart configuration for volume backups
 */
export interface ContainerStopConfig {
  /** Whether to stop containers using the volume before backup (default: false) */
  stopContainers?: boolean;
  /** Timeout in seconds for graceful stop (default: 30, same as docker stop) */
  stopTimeout?: number;
  /** Number of times to retry restarting a container (default: 3) */
  restartRetries?: number;
  /** Delay in milliseconds between restart retries (default: 1000) */
  restartRetryDelay?: number;
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
  /** Per-volume container stop settings (overrides global docker.containerStop) */
  containerStop?: ContainerStopConfig;
}

/**
 * Docker volume backup configuration
 */
export interface DockerConfig {
  /** Enable Docker volume backups */
  enabled: boolean;
  /** List of volumes to backup */
  volumes: DockerVolumeSource[];
  /** Global container stop settings (can be overridden per-volume) */
  containerStop?: ContainerStopConfig;
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
