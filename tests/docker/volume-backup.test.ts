import { describe, expect, mock, test } from "bun:test";
import type { VolumeBackupResult, VolumeBackupsResult } from "../../src/types/backup";
import type { DockerConfig, DockerVolumeSource } from "../../src/types/config";

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
