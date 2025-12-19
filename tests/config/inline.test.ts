import { describe, expect, test } from "bun:test";
import {
  buildInlineConfig,
  canRunWithoutConfigFile,
  createConfigFromInlineOptions,
  extractInlineOptions,
  hasInlineOptions,
  type InlineConfigOptions,
  mergeInlineConfig,
  validateInlineOptionsForConfigFreeMode,
} from "../../src/config/inline";
import type { BackitupConfig } from "../../src/types";

describe("inline config", () => {
  const baseConfig: BackitupConfig = {
    version: "1.0",
    database: { path: "/db.sqlite" },
    sources: {
      app: { path: "/app" },
    },
    local: { enabled: true, path: "/backups" },
    s3: { enabled: false, bucket: "" },
    schedules: {
      daily: {
        cron: "0 2 * * *",
        retention: { maxCount: 7, maxDays: 30 },
      },
    },
  };

  describe("buildInlineConfig", () => {
    test("builds config with database path", () => {
      const options: InlineConfigOptions = {
        database: "/custom/db.sqlite",
      };

      const config = buildInlineConfig(options);

      expect(config.database?.path).toBe("/custom/db.sqlite");
    });

    test("builds config with source paths", () => {
      const options: InlineConfigOptions = {
        source: ["/data", "/logs"],
      };

      const config = buildInlineConfig(options);

      expect(config.sources).toBeDefined();
      expect(Object.keys(config.sources!)).toHaveLength(2);
      expect(config.sources!.data?.path).toBe("/data");
      expect(config.sources!.logs?.path).toBe("/logs");
    });

    test("generates source names from paths", () => {
      const options: InlineConfigOptions = {
        source: ["/var/www/app", "/home/user/documents"],
      };

      const config = buildInlineConfig(options);

      expect(config.sources!.app?.path).toBe("/var/www/app");
      expect(config.sources!.documents?.path).toBe("/home/user/documents");
    });

    test("builds config with source patterns", () => {
      const options: InlineConfigOptions = {
        source: ["/data"],
        pattern: ["**/*.ts", "!**/node_modules/**"],
      };

      const config = buildInlineConfig(options);

      expect(config.sources!.data?.patterns).toEqual(["**/*.ts", "!**/node_modules/**"]);
    });

    test("builds config with local storage settings", () => {
      const options: InlineConfigOptions = {
        localPath: "/custom/backups",
      };

      const config = buildInlineConfig(options);

      expect(config.local?.enabled).toBe(true);
      expect(config.local?.path).toBe("/custom/backups");
    });

    test("builds config with noLocal option", () => {
      const options: InlineConfigOptions = {
        noLocal: true,
      };

      const config = buildInlineConfig(options);

      expect(config.local?.enabled).toBe(false);
    });

    test("builds config with S3 settings", () => {
      const options: InlineConfigOptions = {
        s3Bucket: "my-bucket",
        s3Prefix: "backups/",
        s3Region: "us-west-2",
        s3Endpoint: "https://s3.custom.com",
      };

      const config = buildInlineConfig(options);

      expect(config.s3?.enabled).toBe(true);
      expect(config.s3?.bucket).toBe("my-bucket");
      expect(config.s3?.prefix).toBe("backups/");
      expect(config.s3?.region).toBe("us-west-2");
      expect(config.s3?.endpoint).toBe("https://s3.custom.com");
    });

    test("builds config with S3 credentials", () => {
      const options: InlineConfigOptions = {
        s3Bucket: "my-bucket",
        s3AccessKeyId: "AKIAIOSFODNN7EXAMPLE",
        s3SecretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      };

      const config = buildInlineConfig(options);

      expect(config.s3?.accessKeyId).toBe("AKIAIOSFODNN7EXAMPLE");
      expect(config.s3?.secretAccessKey).toBe("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");
    });

    test("builds config with noS3 option", () => {
      const options: InlineConfigOptions = {
        noS3: true,
      };

      const config = buildInlineConfig(options);

      expect(config.s3?.enabled).toBe(false);
    });

    test("builds config with retention settings", () => {
      const options: InlineConfigOptions = {
        retentionCount: 5,
        retentionDays: 14,
      };

      const config = buildInlineConfig(options);

      expect(config.schedules?.manual?.retention.maxCount).toBe(5);
      expect(config.schedules?.manual?.retention.maxDays).toBe(14);
    });

    test("builds config with archive prefix", () => {
      const options: InlineConfigOptions = {
        archivePrefix: "mybackup",
      };

      const config = buildInlineConfig(options);

      expect(config.archive?.prefix).toBe("mybackup");
    });

    test("builds config with compression level", () => {
      const options: InlineConfigOptions = {
        compression: 9,
      };

      const config = buildInlineConfig(options);

      expect(config.archive?.compression).toBe(9);
    });

    test("builds config with safety settings - verify enabled", () => {
      const options: InlineConfigOptions = {
        verifyBeforeDelete: true,
      };

      const config = buildInlineConfig(options);

      expect(config.safety?.verifyChecksumBeforeDelete).toBe(true);
    });

    test("builds config with safety settings - verify disabled", () => {
      const options: InlineConfigOptions = {
        noVerifyBeforeDelete: true,
      };

      const config = buildInlineConfig(options);

      expect(config.safety?.verifyChecksumBeforeDelete).toBe(false);
    });

    test("builds config with Docker enabled", () => {
      const options: InlineConfigOptions = {
        docker: true,
      };

      const config = buildInlineConfig(options);

      expect(config.docker?.enabled).toBe(true);
    });

    test("builds config with Docker disabled", () => {
      const options: InlineConfigOptions = {
        noDocker: true,
      };

      const config = buildInlineConfig(options);

      expect(config.docker?.enabled).toBe(false);
    });

    test("builds config with Docker volumes", () => {
      const options: InlineConfigOptions = {
        dockerVolume: ["postgres_data", "redis_data"],
      };

      const config = buildInlineConfig(options);

      expect(config.docker?.enabled).toBe(true);
      expect(config.docker?.volumes).toHaveLength(2);
      expect(config.docker?.volumes[0]?.name).toBe("postgres_data");
      expect(config.docker?.volumes[1]?.name).toBe("redis_data");
    });

    test("builds config with stopContainers enabled", () => {
      const options: InlineConfigOptions = {
        dockerVolume: ["postgres_data"],
        stopContainers: true,
      };

      const config = buildInlineConfig(options);

      expect(config.docker?.containerStop?.stopContainers).toBe(true);
    });

    test("builds config with noStopContainers", () => {
      const options: InlineConfigOptions = {
        dockerVolume: ["postgres_data"],
        noStopContainers: true,
      };

      const config = buildInlineConfig(options);

      expect(config.docker?.containerStop?.stopContainers).toBe(false);
    });

    test("builds config with stopTimeout", () => {
      const options: InlineConfigOptions = {
        dockerVolume: ["postgres_data"],
        stopContainers: true,
        stopTimeout: 60,
      };

      const config = buildInlineConfig(options);

      expect(config.docker?.containerStop?.stopTimeout).toBe(60);
    });

    test("builds config with restartRetries", () => {
      const options: InlineConfigOptions = {
        dockerVolume: ["postgres_data"],
        stopContainers: true,
        restartRetries: 5,
      };

      const config = buildInlineConfig(options);

      expect(config.docker?.containerStop?.restartRetries).toBe(5);
    });

    test("builds config with all container stop options", () => {
      const options: InlineConfigOptions = {
        dockerVolume: ["postgres_data"],
        stopContainers: true,
        stopTimeout: 45,
        restartRetries: 3,
      };

      const config = buildInlineConfig(options);

      expect(config.docker?.containerStop?.stopContainers).toBe(true);
      expect(config.docker?.containerStop?.stopTimeout).toBe(45);
      expect(config.docker?.containerStop?.restartRetries).toBe(3);
    });

    test("returns empty config when no options provided", () => {
      const options: InlineConfigOptions = {};

      const config = buildInlineConfig(options);

      expect(Object.keys(config)).toHaveLength(0);
    });
  });

  describe("mergeInlineConfig", () => {
    test("merges database path into base config", () => {
      const options: InlineConfigOptions = {
        database: "/new/db.sqlite",
      };

      const merged = mergeInlineConfig(baseConfig, options);

      expect(merged.database.path).toBe("/new/db.sqlite");
    });

    test("merges source paths into base config", () => {
      const options: InlineConfigOptions = {
        source: ["/new/source"],
      };

      const merged = mergeInlineConfig(baseConfig, options);

      expect(merged.sources.app?.path).toBe("/app"); // original preserved
      expect(merged.sources["source"]?.path).toBe("/new/source"); // new added
    });

    test("overrides local storage path", () => {
      const options: InlineConfigOptions = {
        localPath: "/new/backups",
      };

      const merged = mergeInlineConfig(baseConfig, options);

      expect(merged.local.path).toBe("/new/backups");
      expect(merged.local.enabled).toBe(true);
    });

    test("disables local storage with noLocal", () => {
      const options: InlineConfigOptions = {
        noLocal: true,
      };

      const merged = mergeInlineConfig(baseConfig, options);

      expect(merged.local.enabled).toBe(false);
    });

    test("enables S3 storage with bucket", () => {
      const options: InlineConfigOptions = {
        s3Bucket: "new-bucket",
      };

      const merged = mergeInlineConfig(baseConfig, options);

      expect(merged.s3.enabled).toBe(true);
      expect(merged.s3.bucket).toBe("new-bucket");
    });

    test("preserves base config when no options provided", () => {
      const options: InlineConfigOptions = {};

      const merged = mergeInlineConfig(baseConfig, options);

      expect(merged).toEqual(baseConfig);
    });
  });

  describe("extractInlineOptions", () => {
    test("extracts database option", () => {
      const values = {
        database: "/db.sqlite",
      };

      const options = extractInlineOptions(values);

      expect(options.database).toBe("/db.sqlite");
    });

    test("extracts source options", () => {
      const values = {
        source: ["/data", "/logs"],
      };

      const options = extractInlineOptions(values);

      expect(options.source).toEqual(["/data", "/logs"]);
    });

    test("extracts pattern options", () => {
      const values = {
        pattern: ["**/*.ts", "!**/node_modules/**"],
      };

      const options = extractInlineOptions(values);

      expect(options.pattern).toEqual(["**/*.ts", "!**/node_modules/**"]);
    });

    test("extracts local storage options", () => {
      const values = {
        "local-path": "/backups",
        "no-local": false,
      };

      const options = extractInlineOptions(values);

      expect(options.localPath).toBe("/backups");
      expect(options.noLocal).toBe(false);
    });

    test("extracts S3 options", () => {
      const values = {
        "s3-bucket": "my-bucket",
        "s3-prefix": "prefix/",
        "s3-region": "eu-west-1",
        "s3-endpoint": "https://custom.s3.com",
        "no-s3": false,
      };

      const options = extractInlineOptions(values);

      expect(options.s3Bucket).toBe("my-bucket");
      expect(options.s3Prefix).toBe("prefix/");
      expect(options.s3Region).toBe("eu-west-1");
      expect(options.s3Endpoint).toBe("https://custom.s3.com");
      expect(options.noS3).toBe(false);
    });

    test("extracts S3 credentials", () => {
      const values = {
        "s3-access-key-id": "AKIAIOSFODNN7EXAMPLE",
        "s3-secret-access-key": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      };

      const options = extractInlineOptions(values);

      expect(options.s3AccessKeyId).toBe("AKIAIOSFODNN7EXAMPLE");
      expect(options.s3SecretAccessKey).toBe("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");
    });

    test("extracts retention options and parses as integers", () => {
      const values = {
        "retention-count": "10",
        "retention-days": "30",
      };

      const options = extractInlineOptions(values);

      expect(options.retentionCount).toBe(10);
      expect(options.retentionDays).toBe(30);
    });

    test("extracts archive prefix", () => {
      const values = {
        "archive-prefix": "mybackup",
      };

      const options = extractInlineOptions(values);

      expect(options.archivePrefix).toBe("mybackup");
    });

    test("extracts compression level", () => {
      const values = {
        compression: "9",
      };

      const options = extractInlineOptions(values);

      expect(options.compression).toBe(9);
    });

    test("extracts safety options", () => {
      const values = {
        "verify-before-delete": true,
        "no-verify-before-delete": false,
      };

      const options = extractInlineOptions(values);

      expect(options.verifyBeforeDelete).toBe(true);
      expect(options.noVerifyBeforeDelete).toBe(false);
    });

    test("extracts Docker options", () => {
      const values = {
        docker: true,
        "no-docker": false,
        "docker-volume": ["postgres_data", "redis_data"],
      };

      const options = extractInlineOptions(values);

      expect(options.docker).toBe(true);
      expect(options.noDocker).toBe(false);
      expect(options.dockerVolume).toEqual(["postgres_data", "redis_data"]);
    });

    test("extracts container stop options", () => {
      const values = {
        "stop-containers": true,
        "no-stop-containers": false,
        "stop-timeout": "60",
        "restart-retries": "5",
      };

      const options = extractInlineOptions(values);

      expect(options.stopContainers).toBe(true);
      expect(options.noStopContainers).toBe(false);
      expect(options.stopTimeout).toBe(60);
      expect(options.restartRetries).toBe(5);
    });

    test("parses stop-timeout as integer", () => {
      const values = {
        "stop-timeout": "45",
      };

      const options = extractInlineOptions(values);

      expect(options.stopTimeout).toBe(45);
    });

    test("parses restart-retries as integer", () => {
      const values = {
        "restart-retries": "10",
      };

      const options = extractInlineOptions(values);

      expect(options.restartRetries).toBe(10);
    });

    test("handles undefined values", () => {
      const values = {};

      const options = extractInlineOptions(values);

      expect(options.source).toBeUndefined();
      expect(options.localPath).toBeUndefined();
      expect(options.s3Bucket).toBeUndefined();
      expect(options.retentionCount).toBeUndefined();
    });
  });

  describe("hasInlineOptions", () => {
    test("returns true when database is provided", () => {
      const options: InlineConfigOptions = {
        database: "/db.sqlite",
      };

      expect(hasInlineOptions(options)).toBe(true);
    });

    test("returns true when source is provided", () => {
      const options: InlineConfigOptions = {
        source: ["/data"],
      };

      expect(hasInlineOptions(options)).toBe(true);
    });

    test("returns true when pattern is provided", () => {
      const options: InlineConfigOptions = {
        pattern: ["**/*.ts"],
      };

      expect(hasInlineOptions(options)).toBe(true);
    });

    test("returns true when localPath is provided", () => {
      const options: InlineConfigOptions = {
        localPath: "/backups",
      };

      expect(hasInlineOptions(options)).toBe(true);
    });

    test("returns true when noLocal is true", () => {
      const options: InlineConfigOptions = {
        noLocal: true,
      };

      expect(hasInlineOptions(options)).toBe(true);
    });

    test("returns true when S3 options are provided", () => {
      const options: InlineConfigOptions = {
        s3Bucket: "bucket",
      };

      expect(hasInlineOptions(options)).toBe(true);
    });

    test("returns true when S3 credentials are provided", () => {
      const options: InlineConfigOptions = {
        s3AccessKeyId: "key",
      };

      expect(hasInlineOptions(options)).toBe(true);
    });

    test("returns true when retention options are provided", () => {
      const options: InlineConfigOptions = {
        retentionCount: 5,
      };

      expect(hasInlineOptions(options)).toBe(true);
    });

    test("returns true when archive prefix is provided", () => {
      const options: InlineConfigOptions = {
        archivePrefix: "mybackup",
      };

      expect(hasInlineOptions(options)).toBe(true);
    });

    test("returns true when compression is provided", () => {
      const options: InlineConfigOptions = {
        compression: 9,
      };

      expect(hasInlineOptions(options)).toBe(true);
    });

    test("returns true when safety options are provided", () => {
      const options: InlineConfigOptions = {
        verifyBeforeDelete: true,
      };

      expect(hasInlineOptions(options)).toBe(true);
    });

    test("returns true when Docker options are provided", () => {
      const options: InlineConfigOptions = {
        docker: true,
      };

      expect(hasInlineOptions(options)).toBe(true);
    });

    test("returns true when Docker volumes are provided", () => {
      const options: InlineConfigOptions = {
        dockerVolume: ["postgres_data"],
      };

      expect(hasInlineOptions(options)).toBe(true);
    });

    test("returns true when stopContainers is provided", () => {
      const options: InlineConfigOptions = {
        stopContainers: true,
      };

      expect(hasInlineOptions(options)).toBe(true);
    });

    test("returns true when noStopContainers is provided", () => {
      const options: InlineConfigOptions = {
        noStopContainers: true,
      };

      expect(hasInlineOptions(options)).toBe(true);
    });

    test("returns true when stopTimeout is provided", () => {
      const options: InlineConfigOptions = {
        stopTimeout: 60,
      };

      expect(hasInlineOptions(options)).toBe(true);
    });

    test("returns true when restartRetries is provided", () => {
      const options: InlineConfigOptions = {
        restartRetries: 5,
      };

      expect(hasInlineOptions(options)).toBe(true);
    });

    test("returns false when no options are provided", () => {
      const options: InlineConfigOptions = {};

      expect(hasInlineOptions(options)).toBe(false);
    });

    test("returns false when only undefined values", () => {
      const options: InlineConfigOptions = {
        source: undefined,
        localPath: undefined,
        s3Bucket: undefined,
      };

      expect(hasInlineOptions(options)).toBe(false);
    });

    test("returns false when source is empty array", () => {
      const options: InlineConfigOptions = {
        source: [],
      };

      expect(hasInlineOptions(options)).toBe(false);
    });

    test("returns false when pattern is empty array", () => {
      const options: InlineConfigOptions = {
        pattern: [],
      };

      expect(hasInlineOptions(options)).toBe(false);
    });
  });

  describe("validateInlineOptionsForConfigFreeMode", () => {
    test("valid with source and local path", () => {
      const options: InlineConfigOptions = {
        source: ["/data"],
        localPath: "/backups",
      };

      const result = validateInlineOptionsForConfigFreeMode(options);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("valid with source and S3 bucket", () => {
      const options: InlineConfigOptions = {
        source: ["/data"],
        s3Bucket: "my-bucket",
      };

      const result = validateInlineOptionsForConfigFreeMode(options);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("valid with Docker volumes and local path", () => {
      const options: InlineConfigOptions = {
        dockerVolume: ["postgres_data"],
        localPath: "/backups",
      };

      const result = validateInlineOptionsForConfigFreeMode(options);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("invalid without source or Docker volumes", () => {
      const options: InlineConfigOptions = {
        localPath: "/backups",
      };

      const result = validateInlineOptionsForConfigFreeMode(options);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "At least one --source or --docker-volume is required when running without a config file",
      );
    });

    test("invalid without storage destination", () => {
      const options: InlineConfigOptions = {
        source: ["/data"],
      };

      const result = validateInlineOptionsForConfigFreeMode(options);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "At least one storage destination is required: --local-path or --s3-bucket",
      );
    });

    test("invalid with noLocal and no S3", () => {
      const options: InlineConfigOptions = {
        source: ["/data"],
        noLocal: true,
      };

      const result = validateInlineOptionsForConfigFreeMode(options);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "At least one storage destination is required: --local-path or --s3-bucket",
      );
    });

    test("invalid with noS3 and no local", () => {
      const options: InlineConfigOptions = {
        source: ["/data"],
        noS3: true,
      };

      const result = validateInlineOptionsForConfigFreeMode(options);

      expect(result.valid).toBe(false);
    });

    test("returns multiple errors when both missing", () => {
      const options: InlineConfigOptions = {};

      const result = validateInlineOptionsForConfigFreeMode(options);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });
  });

  describe("canRunWithoutConfigFile", () => {
    test("returns true for valid options", () => {
      const options: InlineConfigOptions = {
        source: ["/data"],
        localPath: "/backups",
      };

      expect(canRunWithoutConfigFile(options)).toBe(true);
    });

    test("returns false for invalid options", () => {
      const options: InlineConfigOptions = {
        source: ["/data"],
      };

      expect(canRunWithoutConfigFile(options)).toBe(false);
    });
  });

  describe("createConfigFromInlineOptions", () => {
    test("creates valid config with source and local path", () => {
      const options: InlineConfigOptions = {
        source: ["/data"],
        localPath: "/backups",
      };

      const config = createConfigFromInlineOptions(options);

      expect(config.version).toBe("1.0");
      expect(config.sources.data?.path).toBe("/data");
      expect(config.local.enabled).toBe(true);
      expect(config.local.path).toBe("/backups");
      expect(config.s3.enabled).toBe(false);
    });

    test("creates valid config with source and S3", () => {
      const options: InlineConfigOptions = {
        source: ["/data"],
        s3Bucket: "my-bucket",
        s3Region: "us-west-2",
      };

      const config = createConfigFromInlineOptions(options);

      expect(config.local.enabled).toBe(false);
      expect(config.s3.enabled).toBe(true);
      expect(config.s3.bucket).toBe("my-bucket");
      expect(config.s3.region).toBe("us-west-2");
    });

    test("creates valid config with Docker volumes", () => {
      const options: InlineConfigOptions = {
        dockerVolume: ["postgres_data", "redis_data"],
        localPath: "/backups",
      };

      const config = createConfigFromInlineOptions(options);

      expect(config.docker?.enabled).toBe(true);
      expect(config.docker?.volumes).toHaveLength(2);
      expect(config.docker?.volumes[0]?.name).toBe("postgres_data");
    });

    test("applies custom database path", () => {
      const options: InlineConfigOptions = {
        source: ["/data"],
        localPath: "/backups",
        database: "/custom/db.sqlite",
      };

      const config = createConfigFromInlineOptions(options);

      expect(config.database.path).toBe("/custom/db.sqlite");
    });

    test("applies default database path when not specified", () => {
      const options: InlineConfigOptions = {
        source: ["/data"],
        localPath: "/backups",
      };

      const config = createConfigFromInlineOptions(options);

      expect(config.database.path).toBe("./backitup.db");
    });

    test("applies custom retention settings", () => {
      const options: InlineConfigOptions = {
        source: ["/data"],
        localPath: "/backups",
        retentionCount: 5,
        retentionDays: 14,
      };

      const config = createConfigFromInlineOptions(options);

      expect(config.schedules.manual?.retention.maxCount).toBe(5);
      expect(config.schedules.manual?.retention.maxDays).toBe(14);
    });

    test("applies default retention when not specified", () => {
      const options: InlineConfigOptions = {
        source: ["/data"],
        localPath: "/backups",
      };

      const config = createConfigFromInlineOptions(options);

      expect(config.schedules.manual?.retention.maxCount).toBe(10);
      expect(config.schedules.manual?.retention.maxDays).toBe(30);
    });

    test("applies custom archive settings", () => {
      const options: InlineConfigOptions = {
        source: ["/data"],
        localPath: "/backups",
        archivePrefix: "mybackup",
        compression: 9,
      };

      const config = createConfigFromInlineOptions(options);

      expect(config.archive?.prefix).toBe("mybackup");
      expect(config.archive?.compression).toBe(9);
    });

    test("applies patterns to sources", () => {
      const options: InlineConfigOptions = {
        source: ["/data"],
        pattern: ["**/*.ts", "!**/node_modules/**"],
        localPath: "/backups",
      };

      const config = createConfigFromInlineOptions(options);

      expect(config.sources.data?.patterns).toEqual(["**/*.ts", "!**/node_modules/**"]);
    });

    test("throws error for invalid options", () => {
      const options: InlineConfigOptions = {
        source: ["/data"],
        // Missing storage
      };

      expect(() => createConfigFromInlineOptions(options)).toThrow(
        "At least one storage destination is required",
      );
    });

    test("creates config with S3 credentials", () => {
      const options: InlineConfigOptions = {
        source: ["/data"],
        s3Bucket: "my-bucket",
        s3AccessKeyId: "AKIAIOSFODNN7EXAMPLE",
        s3SecretAccessKey: "secret",
      };

      const config = createConfigFromInlineOptions(options);

      expect(config.s3.accessKeyId).toBe("AKIAIOSFODNN7EXAMPLE");
      expect(config.s3.secretAccessKey).toBe("secret");
    });

    test("creates config with safety settings", () => {
      const options: InlineConfigOptions = {
        source: ["/data"],
        localPath: "/backups",
        noVerifyBeforeDelete: true,
      };

      const config = createConfigFromInlineOptions(options);

      expect(config.safety?.verifyChecksumBeforeDelete).toBe(false);
    });

    test("creates config with stopContainers enabled", () => {
      const options: InlineConfigOptions = {
        dockerVolume: ["postgres_data"],
        localPath: "/backups",
        stopContainers: true,
      };

      const config = createConfigFromInlineOptions(options);

      expect(config.docker?.containerStop?.stopContainers).toBe(true);
    });

    test("creates config with stopContainers disabled via noStopContainers", () => {
      const options: InlineConfigOptions = {
        dockerVolume: ["postgres_data"],
        localPath: "/backups",
        noStopContainers: true,
      };

      const config = createConfigFromInlineOptions(options);

      expect(config.docker?.containerStop?.stopContainers).toBe(false);
    });

    test("creates config with custom stopTimeout", () => {
      const options: InlineConfigOptions = {
        dockerVolume: ["postgres_data"],
        localPath: "/backups",
        stopContainers: true,
        stopTimeout: 120,
      };

      const config = createConfigFromInlineOptions(options);

      expect(config.docker?.containerStop?.stopTimeout).toBe(120);
    });

    test("creates config with custom restartRetries", () => {
      const options: InlineConfigOptions = {
        dockerVolume: ["postgres_data"],
        localPath: "/backups",
        stopContainers: true,
        restartRetries: 10,
      };

      const config = createConfigFromInlineOptions(options);

      expect(config.docker?.containerStop?.restartRetries).toBe(10);
    });

    test("creates config with all container stop options", () => {
      const options: InlineConfigOptions = {
        dockerVolume: ["postgres_data", "redis_data"],
        localPath: "/backups",
        stopContainers: true,
        stopTimeout: 45,
        restartRetries: 5,
      };

      const config = createConfigFromInlineOptions(options);

      expect(config.docker?.enabled).toBe(true);
      expect(config.docker?.volumes).toHaveLength(2);
      expect(config.docker?.containerStop?.stopContainers).toBe(true);
      expect(config.docker?.containerStop?.stopTimeout).toBe(45);
      expect(config.docker?.containerStop?.restartRetries).toBe(5);
    });

    test("creates config with container stop options but no Docker volumes using source", () => {
      const options: InlineConfigOptions = {
        source: ["/data"],
        localPath: "/backups",
        stopContainers: true,
        stopTimeout: 30,
      };

      const config = createConfigFromInlineOptions(options);

      // Docker config should be created with container stop options
      expect(config.docker?.containerStop?.stopContainers).toBe(true);
      expect(config.docker?.containerStop?.stopTimeout).toBe(30);
    });
  });
});
