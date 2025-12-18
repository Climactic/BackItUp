import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as os from "node:os";
import * as path from "node:path";
import { $ } from "bun";
import {
  ConfigError,
  findAndLoadConfig,
  findConfigFile,
  getSourcesForSchedule,
  loadConfig,
} from "../../src/config/loader";
import type { BackitupConfig } from "../../src/types";

describe("config loader", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = path.join(os.tmpdir(), `backitup-config-test-${Date.now()}`);
    await $`mkdir -p ${tempDir}`;
  });

  afterAll(async () => {
    await $`rm -rf ${tempDir}`.quiet();
  });

  const validConfig = {
    version: "1.0",
    database: { path: "./backitup.db" },
    sources: {
      app: { path: "/var/www/app" },
    },
    local: { enabled: true, path: "./backups" },
    s3: { enabled: false },
    schedules: {
      daily: {
        cron: "0 2 * * *",
        retention: { maxCount: 7, maxDays: 30 },
      },
    },
  };

  describe("loadConfig", () => {
    test("loads valid YAML config", async () => {
      const configPath = path.join(tempDir, "valid.yaml");
      await Bun.write(
        configPath,
        `
version: "1.0"
database:
  path: ./backitup.db
sources:
  app:
    path: /var/www/app
local:
  enabled: true
  path: ./backups
s3:
  enabled: false
schedules:
  daily:
    cron: "0 2 * * *"
    retention:
      maxCount: 7
      maxDays: 30
`,
      );

      const config = await loadConfig(configPath);

      expect(config.version).toBe("1.0");
      expect(config.sources.app!.path).toBe("/var/www/app");
      expect(config.schedules.daily!.cron).toBe("0 2 * * *");
    });

    test("loads valid JSON config", async () => {
      const configPath = path.join(tempDir, "valid.json");
      await Bun.write(configPath, JSON.stringify(validConfig, null, 2));

      const config = await loadConfig(configPath);

      expect(config.version).toBe("1.0");
      expect(config.local.enabled).toBe(true);
    });

    test("resolves relative paths from config directory", async () => {
      const configDir = path.join(tempDir, "subdir");
      await $`mkdir -p ${configDir}`;
      const configPath = path.join(configDir, "config.yaml");
      await Bun.write(
        configPath,
        `
version: "1.0"
database:
  path: ./data/backitup.db
sources:
  app:
    path: /var/www/app
local:
  enabled: true
  path: ./backups
s3:
  enabled: false
schedules:
  daily:
    cron: "0 2 * * *"
    retention:
      maxCount: 7
      maxDays: 30
`,
      );

      const config = await loadConfig(configPath);

      expect(config.database.path).toBe(
        path.join(configDir, "data/backitup.db"),
      );
      expect(config.local.path).toBe(path.join(configDir, "backups"));
    });

    test("preserves absolute paths", async () => {
      const configPath = path.join(tempDir, "absolute.yaml");
      await Bun.write(
        configPath,
        `
version: "1.0"
database:
  path: /absolute/path/db.sqlite
sources:
  app:
    path: /var/www/app
local:
  enabled: true
  path: /absolute/backup/path
s3:
  enabled: false
schedules:
  daily:
    cron: "0 2 * * *"
    retention:
      maxCount: 7
      maxDays: 30
`,
      );

      const config = await loadConfig(configPath);

      expect(config.database.path).toBe("/absolute/path/db.sqlite");
      expect(config.local.path).toBe("/absolute/backup/path");
    });

    test("applies default archive settings", async () => {
      const configPath = path.join(tempDir, "defaults.yaml");
      await Bun.write(
        configPath,
        `
version: "1.0"
database:
  path: ./backitup.db
sources:
  app:
    path: /var/www/app
local:
  enabled: true
  path: ./backups
s3:
  enabled: false
schedules:
  daily:
    cron: "0 2 * * *"
    retention:
      maxCount: 7
      maxDays: 30
`,
      );

      const config = await loadConfig(configPath);

      expect(config.archive?.prefix).toBe("backitup");
      expect(config.archive?.compression).toBe(6);
    });

    test("applies default safety settings", async () => {
      const configPath = path.join(tempDir, "safety-defaults.yaml");
      await Bun.write(
        configPath,
        `
version: "1.0"
database:
  path: ./backitup.db
sources:
  app:
    path: /var/www/app
local:
  enabled: true
  path: ./backups
s3:
  enabled: false
schedules:
  daily:
    cron: "0 2 * * *"
    retention:
      maxCount: 7
      maxDays: 30
`,
      );

      const config = await loadConfig(configPath);

      expect(config.safety?.verifyChecksumBeforeDelete).toBe(true);
    });

    test("throws ConfigError for missing file", async () => {
      const nonExistent = path.join(tempDir, "nonexistent.yaml");
      await expect(loadConfig(nonExistent)).rejects.toThrow(ConfigError);
      await expect(loadConfig(nonExistent)).rejects.toThrow("not found");
    });

    test("throws ConfigError for unsupported format", async () => {
      const configPath = path.join(tempDir, "config.txt");
      await Bun.write(configPath, "some content");

      await expect(loadConfig(configPath)).rejects.toThrow(ConfigError);
      await expect(loadConfig(configPath)).rejects.toThrow(
        "Unsupported config file format",
      );
    });

    test("throws ConfigError for invalid YAML", async () => {
      const configPath = path.join(tempDir, "invalid.yaml");
      await Bun.write(configPath, "invalid: yaml: content: [[[");

      await expect(loadConfig(configPath)).rejects.toThrow(ConfigError);
    });

    test("throws ConfigError for invalid JSON", async () => {
      const configPath = path.join(tempDir, "invalid.json");
      await Bun.write(configPath, "{ invalid json }");

      await expect(loadConfig(configPath)).rejects.toThrow(ConfigError);
    });
  });

  describe("config validation", () => {
    async function writeAndLoad(config: object): Promise<BackitupConfig> {
      const configPath = path.join(tempDir, `test-${Date.now()}.json`);
      await Bun.write(configPath, JSON.stringify(config));
      return loadConfig(configPath);
    }

    test("throws for missing version", async () => {
      const { version, ...noVersion } = validConfig;
      await expect(writeAndLoad(noVersion)).rejects.toThrow("'version' field");
    });

    test("throws for missing database", async () => {
      const { database, ...noDb } = validConfig;
      await expect(writeAndLoad(noDb)).rejects.toThrow("'database' section");
    });

    test("throws for missing database.path", async () => {
      const config = { ...validConfig, database: {} };
      await expect(writeAndLoad(config)).rejects.toThrow("database.path");
    });

    test("throws for missing sources", async () => {
      const { sources, ...noSources } = validConfig;
      await expect(writeAndLoad(noSources)).rejects.toThrow("'sources' object");
    });

    test("throws for empty sources", async () => {
      const config = { ...validConfig, sources: {} };
      await expect(writeAndLoad(config)).rejects.toThrow("at least one source");
    });

    test("throws for source without path", async () => {
      const config = {
        ...validConfig,
        sources: { app: { patterns: ["**/*"] } },
      };
      await expect(writeAndLoad(config)).rejects.toThrow("sources.app.path");
    });

    test("throws for invalid source patterns type", async () => {
      const config = {
        ...validConfig,
        sources: { app: { path: "/app", patterns: "not-array" } },
      };
      await expect(writeAndLoad(config)).rejects.toThrow(
        "sources.app.patterns must be an array",
      );
    });

    test("throws for invalid source s3Prefix type", async () => {
      const config = {
        ...validConfig,
        sources: { app: { path: "/app", s3Prefix: 123 } },
      };
      await expect(writeAndLoad(config)).rejects.toThrow(
        "sources.app.s3Prefix must be a string",
      );
    });

    test("accepts valid source s3Prefix", async () => {
      const config = {
        ...validConfig,
        sources: { app: { path: "/app", s3Prefix: "my-folder" } },
      };
      const loaded = await writeAndLoad(config);
      expect(loaded.sources.app!.s3Prefix).toBe("my-folder");
    });

    test("accepts source without s3Prefix", async () => {
      const config = {
        ...validConfig,
        sources: { app: { path: "/app" } },
      };
      const loaded = await writeAndLoad(config);
      expect(loaded.sources.app!.s3Prefix).toBeUndefined();
    });

    test("throws for missing local section", async () => {
      const { local, ...noLocal } = validConfig;
      await expect(writeAndLoad(noLocal)).rejects.toThrow("'local' section");
    });

    test("throws for missing local.enabled", async () => {
      const config = { ...validConfig, local: { path: "./backups" } };
      await expect(writeAndLoad(config)).rejects.toThrow(
        "local.enabled must be a boolean",
      );
    });

    test("throws for missing local.path when enabled", async () => {
      const config = { ...validConfig, local: { enabled: true } };
      await expect(writeAndLoad(config)).rejects.toThrow(
        "local.path must be a string",
      );
    });

    test("throws for missing s3 section", async () => {
      const { s3, ...noS3 } = validConfig;
      await expect(writeAndLoad(noS3)).rejects.toThrow("'s3' section");
    });

    test("throws for missing s3.bucket when enabled", async () => {
      const config = { ...validConfig, s3: { enabled: true } };
      await expect(writeAndLoad(config)).rejects.toThrow(
        "s3.bucket must be a string",
      );
    });

    test("throws for missing schedules section", async () => {
      const { schedules, ...noSchedules } = validConfig;
      await expect(writeAndLoad(noSchedules)).rejects.toThrow(
        "'schedules' section",
      );
    });

    test("throws for missing schedule.cron", async () => {
      const config = {
        ...validConfig,
        schedules: {
          daily: { retention: { maxCount: 7, maxDays: 30 } },
        },
      };
      await expect(writeAndLoad(config)).rejects.toThrow(
        "schedules.daily.cron",
      );
    });

    test("throws for missing schedule.retention", async () => {
      const config = {
        ...validConfig,
        schedules: {
          daily: { cron: "0 2 * * *" },
        },
      };
      await expect(writeAndLoad(config)).rejects.toThrow(
        "schedules.daily.retention",
      );
    });

    test("throws for invalid retention.maxCount", async () => {
      const config = {
        ...validConfig,
        schedules: {
          daily: { cron: "0 2 * * *", retention: { maxCount: 0, maxDays: 30 } },
        },
      };
      await expect(writeAndLoad(config)).rejects.toThrow(
        "retention.maxCount must be a positive number",
      );
    });

    test("throws for invalid retention.maxDays", async () => {
      const config = {
        ...validConfig,
        schedules: {
          daily: { cron: "0 2 * * *", retention: { maxCount: 7, maxDays: -1 } },
        },
      };
      await expect(writeAndLoad(config)).rejects.toThrow(
        "retention.maxDays must be a positive number",
      );
    });

    test("throws when no storage is enabled", async () => {
      const config = {
        ...validConfig,
        local: { enabled: false },
        s3: { enabled: false },
      };
      await expect(writeAndLoad(config)).rejects.toThrow(
        "At least one storage",
      );
    });

    test("throws for invalid schedule sources reference", async () => {
      const config = {
        ...validConfig,
        schedules: {
          daily: {
            cron: "0 2 * * *",
            retention: { maxCount: 7, maxDays: 30 },
            sources: ["nonexistent"],
          },
        },
      };
      await expect(writeAndLoad(config)).rejects.toThrow(
        'references unknown source "nonexistent"',
      );
    });

    test("accepts valid schedule sources reference", async () => {
      const config = {
        ...validConfig,
        schedules: {
          daily: {
            cron: "0 2 * * *",
            retention: { maxCount: 7, maxDays: 30 },
            sources: ["app"],
          },
        },
      };
      const loaded = await writeAndLoad(config);
      expect(loaded.schedules.daily!.sources).toEqual(["app"]);
    });
  });

  describe("findConfigFile", () => {
    test("finds backitup.config.yaml", async () => {
      const testDir = path.join(tempDir, "find-yaml");
      await $`mkdir -p ${testDir}`;
      await Bun.write(
        path.join(testDir, "backitup.config.yaml"),
        "version: 1.0",
      );

      const found = findConfigFile(testDir);
      expect(found).toBe(path.join(testDir, "backitup.config.yaml"));
    });

    test("finds backitup.config.yml", async () => {
      const testDir = path.join(tempDir, "find-yml");
      await $`mkdir -p ${testDir}`;
      await Bun.write(
        path.join(testDir, "backitup.config.yml"),
        "version: 1.0",
      );

      const found = findConfigFile(testDir);
      expect(found).toBe(path.join(testDir, "backitup.config.yml"));
    });

    test("finds backitup.config.json", async () => {
      const testDir = path.join(tempDir, "find-json");
      await $`mkdir -p ${testDir}`;
      await Bun.write(
        path.join(testDir, "backitup.config.json"),
        '{"version": "1.0"}',
      );

      const found = findConfigFile(testDir);
      expect(found).toBe(path.join(testDir, "backitup.config.json"));
    });

    test("returns null when no config found", async () => {
      const testDir = path.join(tempDir, "empty-dir");
      await $`mkdir -p ${testDir}`;

      const found = findConfigFile(testDir);
      expect(found).toBeNull();
    });

    test("prefers yaml over json", async () => {
      const testDir = path.join(tempDir, "multiple-configs");
      await $`mkdir -p ${testDir}`;
      await Bun.write(
        path.join(testDir, "backitup.config.yaml"),
        "version: yaml",
      );
      await Bun.write(
        path.join(testDir, "backitup.config.json"),
        '{"version": "json"}',
      );

      const found = findConfigFile(testDir);
      expect(found).toBe(path.join(testDir, "backitup.config.yaml"));
    });
  });

  describe("findAndLoadConfig", () => {
    test("loads config from explicit path", async () => {
      const configPath = path.join(tempDir, "explicit.yaml");
      await Bun.write(
        configPath,
        `
version: "1.0"
database:
  path: ./backitup.db
sources:
  app:
    path: /var/www/app
local:
  enabled: true
  path: ./backups
s3:
  enabled: false
schedules:
  daily:
    cron: "0 2 * * *"
    retention:
      maxCount: 7
      maxDays: 30
`,
      );

      const config = await findAndLoadConfig(configPath);
      expect(config.version).toBe("1.0");
    });

    test("throws when no config found and no path provided", async () => {
      // Save current directory and change to empty dir
      const emptyDir = path.join(tempDir, "no-config");
      await $`mkdir -p ${emptyDir}`;
      const originalCwd = process.cwd();

      try {
        process.chdir(emptyDir);
        await expect(findAndLoadConfig()).rejects.toThrow(
          "No config file found",
        );
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe("getSourcesForSchedule", () => {
    const config: BackitupConfig = {
      version: "1.0",
      database: { path: "/db.sqlite" },
      sources: {
        app: { path: "/app" },
        db: { path: "/db" },
        cache: { path: "/cache" },
      },
      local: { enabled: true, path: "/backups" },
      s3: { enabled: false, bucket: "", region: "" },
      schedules: {
        all: {
          cron: "0 * * * *",
          retention: { maxCount: 24, maxDays: 7 },
        },
        partial: {
          cron: "0 2 * * *",
          retention: { maxCount: 7, maxDays: 30 },
          sources: ["app", "db"],
        },
      },
    };

    test("returns all sources when schedule has no sources field", () => {
      const sources = getSourcesForSchedule(config, "all");
      expect(sources).toHaveLength(3);
      expect(sources.map((s) => s.path)).toContain("/app");
      expect(sources.map((s) => s.path)).toContain("/db");
      expect(sources.map((s) => s.path)).toContain("/cache");
    });

    test("returns only specified sources when schedule has sources field", () => {
      const sources = getSourcesForSchedule(config, "partial");
      expect(sources).toHaveLength(2);
      expect(sources.map((s) => s.path)).toContain("/app");
      expect(sources.map((s) => s.path)).toContain("/db");
      expect(sources.map((s) => s.path)).not.toContain("/cache");
    });

    test("throws for unknown schedule", () => {
      expect(() => getSourcesForSchedule(config, "nonexistent")).toThrow(
        'Schedule "nonexistent" not found',
      );
    });
  });
});
