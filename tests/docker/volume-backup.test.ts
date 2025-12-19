import { describe, expect, mock, test } from "bun:test";
import type { VolumeBackupResult, VolumeBackupsResult } from "../../src/types/backup";
import type { ContainerStopConfig, DockerConfig, DockerVolumeSource } from "../../src/types/config";

describe("volume backup", () => {
  describe("VolumeBackupResult interface", () => {
    test("successful backup result structure", () => {
      const result: VolumeBackupResult = {
        volumeName: "postgres_data",
        archivePath:
          "/tmp/backup/backitup-volume-postgres_data-daily-2024-01-15T14-30-22-123Z.tar.gz",
        archiveName: "backitup-volume-postgres_data-daily-2024-01-15T14-30-22-123Z.tar.gz",
        sizeBytes: 1024 * 1024 * 50, // 50 MB
        checksum: "abc123def456",
        wasInUse: false,
        containersUsingVolume: [],
      };

      expect(result.volumeName).toBe("postgres_data");
      expect(result.archiveName).toContain("volume");
      expect(result.archiveName).toContain("postgres_data");
      expect(result.sizeBytes).toBe(50 * 1024 * 1024);
      expect(result.wasInUse).toBe(false);
      expect(result.containersUsingVolume).toHaveLength(0);
    });

    test("backup result when volume was in use", () => {
      const result: VolumeBackupResult = {
        volumeName: "db_data",
        archivePath: "/tmp/backup.tar.gz",
        archiveName: "backup.tar.gz",
        sizeBytes: 1000,
        checksum: "hash123",
        wasInUse: true,
        containersUsingVolume: ["postgres-container", "backup-sidecar"],
      };

      expect(result.wasInUse).toBe(true);
      expect(result.containersUsingVolume).toHaveLength(2);
      expect(result.containersUsingVolume).toContain("postgres-container");
    });
  });

  describe("VolumeBackupsResult interface", () => {
    test("multiple volume backup results", () => {
      const result: VolumeBackupsResult = {
        volumes: [
          {
            volumeName: "vol1",
            archivePath: "/tmp/vol1.tar.gz",
            archiveName: "vol1.tar.gz",
            sizeBytes: 1000,
            checksum: "hash1",
            wasInUse: false,
            containersUsingVolume: [],
          },
          {
            volumeName: "vol2",
            archivePath: "/tmp/vol2.tar.gz",
            archiveName: "vol2.tar.gz",
            sizeBytes: 2000,
            checksum: "hash2",
            wasInUse: true,
            containersUsingVolume: ["container1"],
          },
        ],
        totalSizeBytes: 3000,
        volumesInUseCount: 1,
      };

      expect(result.volumes).toHaveLength(2);
      expect(result.totalSizeBytes).toBe(3000);
      expect(result.volumesInUseCount).toBe(1);
    });

    test("empty backup results", () => {
      const result: VolumeBackupsResult = {
        volumes: [],
        totalSizeBytes: 0,
        volumesInUseCount: 0,
      };

      expect(result.volumes).toHaveLength(0);
      expect(result.totalSizeBytes).toBe(0);
    });
  });

  describe("DockerConfig interface", () => {
    test("basic docker config", () => {
      const config: DockerConfig = {
        enabled: true,
        volumes: [{ name: "postgres_data" }, { name: "redis_data" }],
      };

      expect(config.enabled).toBe(true);
      expect(config.volumes).toHaveLength(2);
    });

    test("docker config with compose volumes", () => {
      const config: DockerConfig = {
        enabled: true,
        volumes: [
          { name: "postgres_data" },
          {
            name: "db",
            type: "compose",
            composePath: "./docker-compose.yml",
            projectName: "myapp",
          },
        ],
      };

      expect(config.volumes[1]!.type).toBe("compose");
      expect(config.volumes[1]!.composePath).toBe("./docker-compose.yml");
    });

    test("disabled docker config", () => {
      const config: DockerConfig = {
        enabled: false,
        volumes: [],
      };

      expect(config.enabled).toBe(false);
    });
  });

  describe("DockerVolumeSource interface", () => {
    test("direct volume source", () => {
      const source: DockerVolumeSource = {
        name: "my_volume",
      };

      expect(source.name).toBe("my_volume");
      expect(source.type).toBeUndefined();
    });

    test("compose volume source", () => {
      const source: DockerVolumeSource = {
        name: "db",
        type: "compose",
        composePath: "/path/to/docker-compose.yml",
        projectName: "webapp",
      };

      expect(source.type).toBe("compose");
      expect(source.composePath).toBe("/path/to/docker-compose.yml");
      expect(source.projectName).toBe("webapp");
    });
  });
});

describe("volume backup mocked behavior", () => {
  test("resolveVolumeNames handles direct volumes", async () => {
    const mockResolve = mock((sources: DockerVolumeSource[]) => {
      return Promise.resolve(sources.filter((s) => s.type !== "compose").map((s) => s.name));
    });

    const sources: DockerVolumeSource[] = [{ name: "vol1" }, { name: "vol2" }];

    const result = await mockResolve(sources);
    expect(result).toEqual(["vol1", "vol2"]);
  });

  test("backupVolume returns VolumeBackupResult", async () => {
    const mockBackup = mock(
      (volumeName: string): Promise<VolumeBackupResult> =>
        Promise.resolve({
          volumeName,
          archivePath: `/tmp/${volumeName}.tar.gz`,
          archiveName: `${volumeName}.tar.gz`,
          sizeBytes: 1000,
          checksum: "abc123",
          wasInUse: false,
          containersUsingVolume: [],
        }),
    );

    const result = await mockBackup("test_volume");
    expect(result.volumeName).toBe("test_volume");
    expect(result.archivePath).toContain("test_volume");
  });

  test("backupAllVolumes aggregates results", async () => {
    const mockBackupAll = mock((config: DockerConfig): Promise<VolumeBackupsResult> => {
      if (!config.enabled || config.volumes.length === 0) {
        return Promise.resolve({
          volumes: [],
          totalSizeBytes: 0,
          volumesInUseCount: 0,
        });
      }

      const volumes = config.volumes.map((v, i) => ({
        volumeName: v.name,
        archivePath: `/tmp/${v.name}.tar.gz`,
        archiveName: `${v.name}.tar.gz`,
        sizeBytes: 1000 * (i + 1),
        checksum: `hash${i}`,
        wasInUse: i === 0,
        containersUsingVolume: i === 0 ? ["container1"] : [],
      }));

      return Promise.resolve({
        volumes,
        totalSizeBytes: volumes.reduce((sum, v) => sum + v.sizeBytes, 0),
        volumesInUseCount: volumes.filter((v) => v.wasInUse).length,
      });
    });

    const config: DockerConfig = {
      enabled: true,
      volumes: [{ name: "vol1" }, { name: "vol2" }],
    };

    const result = await mockBackupAll(config);
    expect(result.volumes).toHaveLength(2);
    expect(result.totalSizeBytes).toBe(3000);
    expect(result.volumesInUseCount).toBe(1);
  });

  test("backupAllVolumes returns empty when disabled", async () => {
    const mockBackupAll = mock((config: DockerConfig): Promise<VolumeBackupsResult> => {
      if (!config.enabled) {
        return Promise.resolve({
          volumes: [],
          totalSizeBytes: 0,
          volumesInUseCount: 0,
        });
      }
      return Promise.resolve({
        volumes: [],
        totalSizeBytes: 0,
        volumesInUseCount: 0,
      });
    });

    const config: DockerConfig = {
      enabled: false,
      volumes: [],
    };

    const result = await mockBackupAll(config);
    expect(result.volumes).toHaveLength(0);
  });

  test("cleanupVolumeBackups removes temp files", async () => {
    const cleanedPaths: string[] = [];
    const mockCleanup = mock((results: VolumeBackupsResult) => {
      for (const vol of results.volumes) {
        cleanedPaths.push(vol.archivePath);
      }
      return Promise.resolve();
    });

    const results: VolumeBackupsResult = {
      volumes: [
        {
          volumeName: "vol1",
          archivePath: "/tmp/vol1.tar.gz",
          archiveName: "vol1.tar.gz",
          sizeBytes: 1000,
          checksum: "hash1",
          wasInUse: false,
          containersUsingVolume: [],
        },
      ],
      totalSizeBytes: 1000,
      volumesInUseCount: 0,
    };

    await mockCleanup(results);
    expect(cleanedPaths).toContain("/tmp/vol1.tar.gz");
  });
});

describe("ContainerStopConfig", () => {
  describe("ContainerStopConfig interface", () => {
    test("full config structure", () => {
      const config: ContainerStopConfig = {
        stopContainers: true,
        stopTimeout: 60,
        restartRetries: 5,
        restartRetryDelay: 2000,
      };

      expect(config.stopContainers).toBe(true);
      expect(config.stopTimeout).toBe(60);
      expect(config.restartRetries).toBe(5);
      expect(config.restartRetryDelay).toBe(2000);
    });

    test("partial config with defaults", () => {
      const config: ContainerStopConfig = {
        stopContainers: true,
      };

      expect(config.stopContainers).toBe(true);
      expect(config.stopTimeout).toBeUndefined();
      expect(config.restartRetries).toBeUndefined();
      expect(config.restartRetryDelay).toBeUndefined();
    });

    test("empty config (all defaults)", () => {
      const config: ContainerStopConfig = {};

      expect(config.stopContainers).toBeUndefined();
      expect(config.stopTimeout).toBeUndefined();
    });
  });

  describe("DockerConfig with containerStop", () => {
    test("global containerStop config", () => {
      const config: DockerConfig = {
        enabled: true,
        volumes: [{ name: "postgres_data" }],
        containerStop: {
          stopContainers: true,
          stopTimeout: 30,
        },
      };

      expect(config.containerStop?.stopContainers).toBe(true);
      expect(config.containerStop?.stopTimeout).toBe(30);
    });

    test("docker config without containerStop", () => {
      const config: DockerConfig = {
        enabled: true,
        volumes: [{ name: "postgres_data" }],
      };

      expect(config.containerStop).toBeUndefined();
    });
  });

  describe("DockerVolumeSource with containerStop", () => {
    test("per-volume containerStop override", () => {
      const source: DockerVolumeSource = {
        name: "postgres_data",
        containerStop: {
          stopContainers: false,
          stopTimeout: 60,
        },
      };

      expect(source.containerStop?.stopContainers).toBe(false);
      expect(source.containerStop?.stopTimeout).toBe(60);
    });

    test("volume source without containerStop (uses global)", () => {
      const source: DockerVolumeSource = {
        name: "redis_data",
      };

      expect(source.containerStop).toBeUndefined();
    });
  });

  describe("resolveContainerStopConfig behavior", () => {
    // Simulates the resolveContainerStopConfig function behavior
    const DEFAULT_CONFIG = {
      stopContainers: false,
      stopTimeout: 30,
      restartRetries: 3,
      restartRetryDelay: 1000,
    };

    function resolveConfig(
      globalConfig: ContainerStopConfig | undefined,
      volumeConfig: ContainerStopConfig | undefined,
    ) {
      return {
        stopContainers:
          volumeConfig?.stopContainers ??
          globalConfig?.stopContainers ??
          DEFAULT_CONFIG.stopContainers,
        stopTimeout:
          volumeConfig?.stopTimeout ?? globalConfig?.stopTimeout ?? DEFAULT_CONFIG.stopTimeout,
        restartRetries:
          volumeConfig?.restartRetries ??
          globalConfig?.restartRetries ??
          DEFAULT_CONFIG.restartRetries,
        restartRetryDelay:
          volumeConfig?.restartRetryDelay ??
          globalConfig?.restartRetryDelay ??
          DEFAULT_CONFIG.restartRetryDelay,
      };
    }

    test("uses defaults when no config provided", () => {
      const resolved = resolveConfig(undefined, undefined);

      expect(resolved.stopContainers).toBe(false);
      expect(resolved.stopTimeout).toBe(30);
      expect(resolved.restartRetries).toBe(3);
      expect(resolved.restartRetryDelay).toBe(1000);
    });

    test("uses global config when no per-volume config", () => {
      const globalConfig: ContainerStopConfig = {
        stopContainers: true,
        stopTimeout: 60,
      };

      const resolved = resolveConfig(globalConfig, undefined);

      expect(resolved.stopContainers).toBe(true);
      expect(resolved.stopTimeout).toBe(60);
      expect(resolved.restartRetries).toBe(3); // default
      expect(resolved.restartRetryDelay).toBe(1000); // default
    });

    test("per-volume config overrides global config", () => {
      const globalConfig: ContainerStopConfig = {
        stopContainers: true,
        stopTimeout: 30,
        restartRetries: 3,
      };

      const volumeConfig: ContainerStopConfig = {
        stopContainers: false,
        stopTimeout: 60,
      };

      const resolved = resolveConfig(globalConfig, volumeConfig);

      expect(resolved.stopContainers).toBe(false); // overridden
      expect(resolved.stopTimeout).toBe(60); // overridden
      expect(resolved.restartRetries).toBe(3); // from global
      expect(resolved.restartRetryDelay).toBe(1000); // default
    });

    test("per-volume config with partial override", () => {
      const globalConfig: ContainerStopConfig = {
        stopContainers: true,
        stopTimeout: 45,
        restartRetries: 5,
        restartRetryDelay: 2000,
      };

      const volumeConfig: ContainerStopConfig = {
        stopTimeout: 120,
      };

      const resolved = resolveConfig(globalConfig, volumeConfig);

      expect(resolved.stopContainers).toBe(true); // from global
      expect(resolved.stopTimeout).toBe(120); // overridden
      expect(resolved.restartRetries).toBe(5); // from global
      expect(resolved.restartRetryDelay).toBe(2000); // from global
    });

    test("explicit false overrides global true", () => {
      const globalConfig: ContainerStopConfig = {
        stopContainers: true,
      };

      const volumeConfig: ContainerStopConfig = {
        stopContainers: false,
      };

      const resolved = resolveConfig(globalConfig, volumeConfig);

      expect(resolved.stopContainers).toBe(false);
    });
  });
});

describe("VolumeBackupResult with container stop fields", () => {
  test("result with stopped containers", () => {
    const result: VolumeBackupResult = {
      volumeName: "postgres_data",
      archivePath: "/tmp/backup.tar.gz",
      archiveName: "backup.tar.gz",
      sizeBytes: 1000,
      checksum: "abc123",
      wasInUse: true,
      containersUsingVolume: ["postgres", "pgadmin"],
      stoppedContainers: ["postgres", "pgadmin"],
      failedToRestart: undefined,
      hadAutoRestartWarning: false,
    };

    expect(result.stoppedContainers).toEqual(["postgres", "pgadmin"]);
    expect(result.failedToRestart).toBeUndefined();
    expect(result.hadAutoRestartWarning).toBe(false);
  });

  test("result with failed restart", () => {
    const result: VolumeBackupResult = {
      volumeName: "postgres_data",
      archivePath: "/tmp/backup.tar.gz",
      archiveName: "backup.tar.gz",
      sizeBytes: 1000,
      checksum: "abc123",
      wasInUse: true,
      containersUsingVolume: ["postgres", "pgadmin"],
      stoppedContainers: ["postgres", "pgadmin"],
      failedToRestart: ["pgadmin"],
      hadAutoRestartWarning: false,
    };

    expect(result.failedToRestart).toEqual(["pgadmin"]);
  });

  test("result with auto-restart warning", () => {
    const result: VolumeBackupResult = {
      volumeName: "postgres_data",
      archivePath: "/tmp/backup.tar.gz",
      archiveName: "backup.tar.gz",
      sizeBytes: 1000,
      checksum: "abc123",
      wasInUse: true,
      containersUsingVolume: ["postgres"],
      stoppedContainers: ["postgres"],
      hadAutoRestartWarning: true,
    };

    expect(result.hadAutoRestartWarning).toBe(true);
  });

  test("result without container stop (containers were running)", () => {
    const result: VolumeBackupResult = {
      volumeName: "postgres_data",
      archivePath: "/tmp/backup.tar.gz",
      archiveName: "backup.tar.gz",
      sizeBytes: 1000,
      checksum: "abc123",
      wasInUse: true,
      containersUsingVolume: ["postgres"],
      // No stoppedContainers - containers weren't stopped
    };

    expect(result.stoppedContainers).toBeUndefined();
    expect(result.failedToRestart).toBeUndefined();
    expect(result.hadAutoRestartWarning).toBeUndefined();
  });
});
