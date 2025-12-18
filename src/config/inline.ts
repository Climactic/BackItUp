/**
 * Inline configuration parsing and merging utilities
 */

import type { BackitupConfig, DockerVolumeSource } from "../types";
import { deepMerge } from "./defaults";

/**
 * Inline configuration options that can be passed via CLI flags
 */
export interface InlineConfigOptions {
  // Database
  /** Database file path */
  database?: string;

  // Sources
  /** Source paths to backup (can be repeated) */
  source?: string[];
  /** Glob patterns for filtering files (can be repeated) */
  pattern?: string[];

  // Local storage
  /** Local storage path */
  localPath?: string;
  /** Disable local storage */
  noLocal?: boolean;

  // S3 storage
  /** S3 bucket name */
  s3Bucket?: string;
  /** S3 prefix */
  s3Prefix?: string;
  /** S3 region */
  s3Region?: string;
  /** S3 endpoint (for S3-compatible storage) */
  s3Endpoint?: string;
  /** S3 access key ID */
  s3AccessKeyId?: string;
  /** S3 secret access key */
  s3SecretAccessKey?: string;
  /** Disable S3 storage */
  noS3?: boolean;

  // Retention
  /** Maximum number of backups to retain */
  retentionCount?: number;
  /** Maximum days to retain backups */
  retentionDays?: number;

  // Archive
  /** Archive filename prefix */
  archivePrefix?: string;
  /** Compression level (0-9) */
  compression?: number;

  // Safety
  /** Verify checksums before deleting backups */
  verifyBeforeDelete?: boolean;
  /** Skip checksum verification before deleting */
  noVerifyBeforeDelete?: boolean;

  // Docker
  /** Enable Docker volume backups */
  docker?: boolean;
  /** Disable Docker volume backups */
  noDocker?: boolean;
  /** Docker volumes to backup (can be repeated) */
  dockerVolume?: string[];
}

/**
 * Build a partial config from inline options
 */
export function buildInlineConfig(options: InlineConfigOptions): Partial<BackitupConfig> {
  const config: Partial<BackitupConfig> = {};

  // Handle database
  if (options.database) {
    config.database = { path: options.database };
  }

  // Handle sources
  if (options.source && options.source.length > 0) {
    config.sources = {};
    for (let i = 0; i < options.source.length; i++) {
      const sourcePath: string = options.source[i]!;
      // Generate a name from the path (last directory component)
      const name = sourcePath.split("/").filter(Boolean).pop() || `source${i}`;
      config.sources[name] = {
        path: sourcePath,
        ...(options.pattern && options.pattern.length > 0 && { patterns: options.pattern }),
      };
    }
  }

  // Handle local storage
  if (options.noLocal) {
    config.local = { enabled: false, path: "" };
  } else if (options.localPath) {
    config.local = { enabled: true, path: options.localPath };
  }

  // Handle S3 storage
  if (options.noS3) {
    config.s3 = {
      enabled: false,
      bucket: "",
    };
  } else if (
    options.s3Bucket ||
    options.s3Prefix ||
    options.s3Region ||
    options.s3Endpoint ||
    options.s3AccessKeyId ||
    options.s3SecretAccessKey
  ) {
    config.s3 = {
      enabled: true,
      bucket: options.s3Bucket || "",
      ...(options.s3Prefix && { prefix: options.s3Prefix }),
      ...(options.s3Region && { region: options.s3Region }),
      ...(options.s3Endpoint && { endpoint: options.s3Endpoint }),
      ...(options.s3AccessKeyId && { accessKeyId: options.s3AccessKeyId }),
      ...(options.s3SecretAccessKey && {
        secretAccessKey: options.s3SecretAccessKey,
      }),
    };
  }

  // Handle retention (applied to manual schedule)
  if (options.retentionCount !== undefined || options.retentionDays !== undefined) {
    config.schedules = {
      manual: {
        cron: "",
        retention: {
          maxCount: options.retentionCount ?? 10,
          maxDays: options.retentionDays ?? 30,
        },
      },
    };
  }

  // Handle archive settings
  if (options.archivePrefix || options.compression !== undefined) {
    config.archive = {
      ...(options.archivePrefix && { prefix: options.archivePrefix }),
      ...(options.compression !== undefined && {
        compression: options.compression,
      }),
    };
  }

  // Handle safety settings
  if (options.verifyBeforeDelete !== undefined || options.noVerifyBeforeDelete !== undefined) {
    config.safety = {
      dryRun: false,
      verifyChecksumBeforeDelete: options.noVerifyBeforeDelete
        ? false
        : (options.verifyBeforeDelete ?? true),
    };
  }

  // Handle Docker settings
  if (
    options.docker !== undefined ||
    options.noDocker !== undefined ||
    (options.dockerVolume && options.dockerVolume.length > 0)
  ) {
    const volumes: DockerVolumeSource[] = (options.dockerVolume || []).map((name) => ({ name }));
    config.docker = {
      enabled: options.noDocker ? false : (options.docker ?? volumes.length > 0),
      volumes,
    };
  }

  return config;
}

/**
 * Merge inline config options into an existing config
 */
export function mergeInlineConfig(
  baseConfig: BackitupConfig,
  inlineOptions: InlineConfigOptions,
): BackitupConfig {
  const inlineConfig = buildInlineConfig(inlineOptions);

  // Deep merge inline config into base config
  return deepMerge(baseConfig, inlineConfig) as BackitupConfig;
}

/**
 * CLI option definitions for inline config (for parseArgs)
 */
export const INLINE_CONFIG_OPTIONS = {
  // Database
  database: { type: "string" as const },

  // Sources
  source: { type: "string" as const, multiple: true },
  pattern: { type: "string" as const, multiple: true },

  // Local storage
  "local-path": { type: "string" as const },
  "no-local": { type: "boolean" as const, default: false },

  // S3 storage
  "s3-bucket": { type: "string" as const },
  "s3-prefix": { type: "string" as const },
  "s3-region": { type: "string" as const },
  "s3-endpoint": { type: "string" as const },
  "s3-access-key-id": { type: "string" as const },
  "s3-secret-access-key": { type: "string" as const },
  "no-s3": { type: "boolean" as const, default: false },

  // Retention
  "retention-count": { type: "string" as const },
  "retention-days": { type: "string" as const },

  // Archive
  "archive-prefix": { type: "string" as const },
  compression: { type: "string" as const },

  // Safety
  "verify-before-delete": { type: "boolean" as const },
  "no-verify-before-delete": { type: "boolean" as const, default: false },

  // Docker
  docker: { type: "boolean" as const },
  "no-docker": { type: "boolean" as const, default: false },
  "docker-volume": { type: "string" as const, multiple: true },
} as const;

/**
 * Extract inline config options from parsed CLI values
 */
export function extractInlineOptions(values: Record<string, unknown>): InlineConfigOptions {
  return {
    // Database
    database: values.database as string | undefined,

    // Sources
    source: values.source as string[] | undefined,
    pattern: values.pattern as string[] | undefined,

    // Local storage
    localPath: values["local-path"] as string | undefined,
    noLocal: values["no-local"] as boolean | undefined,

    // S3 storage
    s3Bucket: values["s3-bucket"] as string | undefined,
    s3Prefix: values["s3-prefix"] as string | undefined,
    s3Region: values["s3-region"] as string | undefined,
    s3Endpoint: values["s3-endpoint"] as string | undefined,
    s3AccessKeyId: values["s3-access-key-id"] as string | undefined,
    s3SecretAccessKey: values["s3-secret-access-key"] as string | undefined,
    noS3: values["no-s3"] as boolean | undefined,

    // Retention
    retentionCount: values["retention-count"]
      ? parseInt(values["retention-count"] as string, 10)
      : undefined,
    retentionDays: values["retention-days"]
      ? parseInt(values["retention-days"] as string, 10)
      : undefined,

    // Archive
    archivePrefix: values["archive-prefix"] as string | undefined,
    compression: values.compression ? parseInt(values.compression as string, 10) : undefined,

    // Safety
    verifyBeforeDelete: values["verify-before-delete"] as boolean | undefined,
    noVerifyBeforeDelete: values["no-verify-before-delete"] as boolean | undefined,

    // Docker
    docker: values.docker as boolean | undefined,
    noDocker: values["no-docker"] as boolean | undefined,
    dockerVolume: values["docker-volume"] as string[] | undefined,
  };
}

/**
 * Check if any inline config options were provided
 */
export function hasInlineOptions(options: InlineConfigOptions): boolean {
  return !!(
    // Database
    (
      options.database ||
      // Sources
      (options.source && options.source.length > 0) ||
      (options.pattern && options.pattern.length > 0) ||
      // Local storage
      options.localPath ||
      options.noLocal ||
      // S3 storage
      options.s3Bucket ||
      options.s3Prefix ||
      options.s3Region ||
      options.s3Endpoint ||
      options.s3AccessKeyId ||
      options.s3SecretAccessKey ||
      options.noS3 ||
      // Retention
      options.retentionCount !== undefined ||
      options.retentionDays !== undefined ||
      // Archive
      options.archivePrefix ||
      options.compression !== undefined ||
      // Safety
      options.verifyBeforeDelete !== undefined ||
      options.noVerifyBeforeDelete ||
      // Docker
      options.docker !== undefined ||
      options.noDocker ||
      (options.dockerVolume && options.dockerVolume.length > 0)
    )
  );
}

/**
 * Validation result for inline options
 */
export interface InlineValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Check if inline options are sufficient to run without a config file.
 * Requires at minimum:
 * - At least one source (--source) OR Docker volumes (--docker-volume)
 * - At least one storage destination (--local-path or --s3-bucket)
 */
export function validateInlineOptionsForConfigFreeMode(
  options: InlineConfigOptions,
): InlineValidationResult {
  const errors: string[] = [];

  // Check for sources
  const hasSources = options.source && options.source.length > 0;
  const hasDockerVolumes = options.dockerVolume && options.dockerVolume.length > 0;

  if (!hasSources && !hasDockerVolumes) {
    errors.push(
      "At least one --source or --docker-volume is required when running without a config file",
    );
  }

  // Check for storage
  const hasLocalStorage = options.localPath && !options.noLocal;
  const hasS3Storage = options.s3Bucket && !options.noS3;

  if (!hasLocalStorage && !hasS3Storage) {
    errors.push("At least one storage destination is required: --local-path or --s3-bucket");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if inline options can support config-free mode
 */
export function canRunWithoutConfigFile(options: InlineConfigOptions): boolean {
  return validateInlineOptionsForConfigFreeMode(options).valid;
}

/**
 * Create a complete config from inline options only (no base config file).
 * Used when running without a config file.
 */
export function createConfigFromInlineOptions(options: InlineConfigOptions): BackitupConfig {
  const validation = validateInlineOptionsForConfigFreeMode(options);
  if (!validation.valid) {
    throw new Error(validation.errors.join("\n"));
  }

  // Build sources
  const sources: Record<string, { path: string; patterns?: string[] }> = {};
  if (options.source && options.source.length > 0) {
    for (let i = 0; i < options.source.length; i++) {
      const sourcePath: string = options.source[i]!;
      const name = sourcePath.split("/").filter(Boolean).pop() || `source${i}`;
      sources[name] = {
        path: sourcePath,
        ...(options.pattern && options.pattern.length > 0 && { patterns: options.pattern }),
      };
    }
  }

  // Build config
  const config: BackitupConfig = {
    version: "1.0",
    database: {
      path: options.database || "./backitup.db",
    },
    sources,
    local: {
      enabled: !options.noLocal && !!options.localPath,
      path: options.localPath || "",
    },
    s3: {
      enabled: !options.noS3 && !!options.s3Bucket,
      bucket: options.s3Bucket || "",
      ...(options.s3Prefix && { prefix: options.s3Prefix }),
      ...(options.s3Region && { region: options.s3Region }),
      ...(options.s3Endpoint && { endpoint: options.s3Endpoint }),
      ...(options.s3AccessKeyId && { accessKeyId: options.s3AccessKeyId }),
      ...(options.s3SecretAccessKey && {
        secretAccessKey: options.s3SecretAccessKey,
      }),
    },
    schedules: {
      manual: {
        cron: "",
        retention: {
          maxCount: options.retentionCount ?? 10,
          maxDays: options.retentionDays ?? 30,
        },
      },
    },
    archive: {
      prefix: options.archivePrefix || "backitup",
      compression: options.compression ?? 6,
    },
    safety: {
      dryRun: false,
      verifyChecksumBeforeDelete: options.noVerifyBeforeDelete
        ? false
        : (options.verifyBeforeDelete ?? true),
    },
  };

  // Add Docker config if volumes specified
  if (options.dockerVolume && options.dockerVolume.length > 0) {
    config.docker = {
      enabled: !options.noDocker,
      volumes: options.dockerVolume.map((name) => ({ name })),
    };
  } else if (options.docker !== undefined || options.noDocker) {
    config.docker = {
      enabled: options.noDocker ? false : (options.docker ?? false),
      volumes: [],
    };
  }

  return config;
}
