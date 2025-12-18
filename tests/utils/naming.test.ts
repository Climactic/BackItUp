import { describe, expect, test } from "bun:test";
import {
  ARCHIVE_NAME_PATTERN,
  formatBytes,
  formatDuration,
  generateArchiveName,
  isValidArchiveName,
  isVolumeArchiveName,
  parseArchiveName,
  parseVolumeArchiveName,
  VOLUME_ARCHIVE_NAME_PATTERN,
} from "../../src/utils/naming";

describe("naming utilities", () => {
  describe("generateArchiveName", () => {
    test("generates valid archive name with default prefix", () => {
      const name = generateArchiveName("daily");
      expect(name).toMatch(ARCHIVE_NAME_PATTERN);
      expect(name).toContain("backitup_");
      expect(name).toContain("_daily_");
      expect(name).toEndWith(".tar.gz");
    });

    test("generates valid archive name with custom prefix", () => {
      const name = generateArchiveName("hourly", "myapp");
      expect(name).toMatch(/^myapp_/);
      expect(name).toContain("_hourly_");
    });

    test("includes single source name", () => {
      const name = generateArchiveName("daily", "backitup", ["app"]);
      expect(name).toContain("_app_");
    });

    test("includes multiple source names joined with hyphen", () => {
      const name = generateArchiveName("daily", "backitup", ["app", "db"]);
      expect(name).toContain("_app-db_");
    });

    test("uses 'all' when no sources specified", () => {
      const name = generateArchiveName("daily", "backitup");
      expect(name).toContain("_all_");
    });

    test("uses 'all' when empty sources array", () => {
      const name = generateArchiveName("daily", "backitup", []);
      expect(name).toContain("_all_");
    });

    test("includes date in YYYY-MM-DD format", () => {
      const name = generateArchiveName("daily");
      const dateMatch = name.match(/_(\d{4}-\d{2}-\d{2})_/);
      expect(dateMatch).not.toBeNull();
      const date = new Date(dateMatch?.[1] ?? "");
      expect(date.toString()).not.toBe("Invalid Date");
    });

    test("includes time in HHMMSS format", () => {
      const name = generateArchiveName("daily");
      const timeMatch = name.match(/_(\d{6})_/);
      expect(timeMatch).not.toBeNull();
    });

    test("includes 6-character short ID", () => {
      const name = generateArchiveName("daily");
      const idMatch = name.match(/_([a-z0-9]{6})\.tar\.gz$/);
      expect(idMatch).not.toBeNull();
    });

    test("generates unique names on each call", () => {
      const names = new Set<string>();
      for (let i = 0; i < 100; i++) {
        names.add(generateArchiveName("daily"));
      }
      // All should be unique (short IDs are random)
      expect(names.size).toBe(100);
    });
  });

  describe("parseArchiveName", () => {
    test("parses valid archive name", () => {
      const result = parseArchiveName("backitup_app_daily_2024-01-15_143022_abc123.tar.gz");
      expect(result).toEqual({
        prefix: "backitup",
        sources: "app",
        schedule: "daily",
        date: "2024-01-15",
        time: "143022",
        shortId: "abc123",
      });
    });

    test("parses archive name with hyphenated sources", () => {
      const result = parseArchiveName(
        "backitup_app-db-cache_hourly_2024-01-15_143022_xyz789.tar.gz",
      );
      expect(result).toEqual({
        prefix: "backitup",
        sources: "app-db-cache",
        schedule: "hourly",
        date: "2024-01-15",
        time: "143022",
        shortId: "xyz789",
      });
    });

    test("parses archive name with 'all' sources", () => {
      const result = parseArchiveName("backitup_all_weekly_2024-01-15_143022_abc123.tar.gz");
      expect(result?.sources).toBe("all");
    });

    test("returns null for invalid names", () => {
      expect(parseArchiveName("invalid.tar.gz")).toBeNull();
      expect(parseArchiveName("")).toBeNull();
      expect(parseArchiveName("backitup.tar.gz")).toBeNull();
      expect(parseArchiveName("backitup_daily_2024-01-15.tar.gz")).toBeNull();
    });

    test("returns null for wrong extension", () => {
      expect(parseArchiveName("backitup_app_daily_2024-01-15_143022_abc123.zip")).toBeNull();
    });

    test("roundtrips with generateArchiveName", () => {
      const generated = generateArchiveName("weekly", "backitup", ["app"]);
      const parsed = parseArchiveName(generated);
      expect(parsed).not.toBeNull();
      expect(parsed?.prefix).toBe("backitup");
      expect(parsed?.sources).toBe("app");
      expect(parsed?.schedule).toBe("weekly");
    });
  });

  describe("isValidArchiveName", () => {
    test("validates correct archive names", () => {
      expect(isValidArchiveName("backitup_app_daily_2024-01-15_143022_abc123.tar.gz")).toBe(true);
      expect(isValidArchiveName("backitup_all_hourly_2024-12-31_235959_xyz789.tar.gz")).toBe(true);
    });

    test("validates with custom prefix", () => {
      expect(isValidArchiveName("myapp_app_daily_2024-01-15_143022_abc123.tar.gz", "myapp")).toBe(
        true,
      );
      expect(
        isValidArchiveName("myapp_app_daily_2024-01-15_143022_abc123.tar.gz", "backitup"),
      ).toBe(false);
    });

    test("rejects invalid archive names", () => {
      expect(isValidArchiveName("invalid.tar.gz")).toBe(false);
      expect(isValidArchiveName("")).toBe(false);
      expect(isValidArchiveName("random_file.tar.gz")).toBe(false);
    });

    test("rejects names with wrong prefix", () => {
      expect(isValidArchiveName("wrong_app_daily_2024-01-15_143022_abc123.tar.gz")).toBe(false);
    });
  });

  describe("ARCHIVE_NAME_PATTERN", () => {
    test("matches valid patterns", () => {
      expect(ARCHIVE_NAME_PATTERN.test("backitup_app_daily_2024-01-15_143022_abc123.tar.gz")).toBe(
        true,
      );
      expect(
        ARCHIVE_NAME_PATTERN.test("backitup_app-db_hourly_2024-01-15_143022_abc123.tar.gz"),
      ).toBe(true);
      expect(ARCHIVE_NAME_PATTERN.test("myapp_all_weekly_2024-12-31_000000_000000.tar.gz")).toBe(
        true,
      );
    });

    test("rejects invalid patterns", () => {
      expect(ARCHIVE_NAME_PATTERN.test("Backitup_app_daily_2024-01-15_143022_abc123.tar.gz")).toBe(
        false,
      ); // uppercase
      expect(ARCHIVE_NAME_PATTERN.test("backitup_App_daily_2024-01-15_143022_abc123.tar.gz")).toBe(
        false,
      ); // uppercase source
      expect(ARCHIVE_NAME_PATTERN.test("backitup_app_Daily_2024-01-15_143022_abc123.tar.gz")).toBe(
        false,
      ); // uppercase schedule
    });
  });

  describe("formatBytes", () => {
    test("formats zero bytes", () => {
      expect(formatBytes(0)).toBe("0 B");
    });

    test("formats bytes", () => {
      expect(formatBytes(500)).toBe("500.00 B");
      expect(formatBytes(1)).toBe("1.00 B");
    });

    test("formats kilobytes", () => {
      expect(formatBytes(1024)).toBe("1.00 KB");
      expect(formatBytes(1536)).toBe("1.50 KB");
      expect(formatBytes(10240)).toBe("10.00 KB");
    });

    test("formats megabytes", () => {
      expect(formatBytes(1024 * 1024)).toBe("1.00 MB");
      expect(formatBytes(1024 * 1024 * 5.5)).toBe("5.50 MB");
    });

    test("formats gigabytes", () => {
      expect(formatBytes(1024 * 1024 * 1024)).toBe("1.00 GB");
      expect(formatBytes(1024 * 1024 * 1024 * 2.25)).toBe("2.25 GB");
    });

    test("formats terabytes", () => {
      expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe("1.00 TB");
    });
  });

  describe("formatDuration", () => {
    test("formats milliseconds", () => {
      expect(formatDuration(0)).toBe("0ms");
      expect(formatDuration(500)).toBe("500ms");
      expect(formatDuration(999)).toBe("999ms");
    });

    test("formats seconds", () => {
      expect(formatDuration(1000)).toBe("1.0s");
      expect(formatDuration(1500)).toBe("1.5s");
      expect(formatDuration(59999)).toBe("60.0s");
    });

    test("formats minutes and seconds", () => {
      expect(formatDuration(60000)).toBe("1m 0s");
      expect(formatDuration(90000)).toBe("1m 30s");
      expect(formatDuration(3599999)).toBe("59m 59s");
    });

    test("formats hours and minutes", () => {
      expect(formatDuration(3600000)).toBe("1h 0m");
      expect(formatDuration(3660000)).toBe("1h 1m");
      expect(formatDuration(7200000)).toBe("2h 0m");
    });
  });

  describe("VOLUME_ARCHIVE_NAME_PATTERN", () => {
    test("matches valid volume archive names", () => {
      expect(
        VOLUME_ARCHIVE_NAME_PATTERN.test(
          "backitup-volume-postgres_data-daily-2024-01-15T14-30-22-123Z.tar.gz",
        ),
      ).toBe(true);
      expect(
        VOLUME_ARCHIVE_NAME_PATTERN.test(
          "backitup-volume-my-volume-hourly-2024-12-31T23-59-59-999Z.tar.gz",
        ),
      ).toBe(true);
      expect(
        VOLUME_ARCHIVE_NAME_PATTERN.test(
          "myapp-volume-db_data-weekly-2024-01-01T00-00-00-000Z.tar.gz",
        ),
      ).toBe(true);
    });

    test("rejects invalid volume archive names", () => {
      // Wrong format
      expect(
        VOLUME_ARCHIVE_NAME_PATTERN.test("backitup_app_daily_2024-01-15_143022_abc123.tar.gz"),
      ).toBe(false);
      // Missing volume marker
      expect(
        VOLUME_ARCHIVE_NAME_PATTERN.test(
          "backitup-postgres_data-daily-2024-01-15T14-30-22-123Z.tar.gz",
        ),
      ).toBe(false);
      // Wrong extension
      expect(
        VOLUME_ARCHIVE_NAME_PATTERN.test("backitup-volume-data-daily-2024-01-15T14-30-22-123Z.zip"),
      ).toBe(false);
    });
  });

  describe("parseVolumeArchiveName", () => {
    test("parses valid volume archive name", () => {
      const result = parseVolumeArchiveName(
        "backitup-volume-postgres_data-daily-2024-01-15T14-30-22-123Z.tar.gz",
      );

      expect(result).toEqual({
        prefix: "backitup",
        volumeName: "postgres_data",
        schedule: "daily",
        timestamp: "2024-01-15T14-30-22-123Z",
      });
    });

    test("parses volume name with hyphens", () => {
      const result = parseVolumeArchiveName(
        "backitup-volume-my-app-data-hourly-2024-01-15T14-30-22-123Z.tar.gz",
      );

      expect(result).toEqual({
        prefix: "backitup",
        volumeName: "my-app-data",
        schedule: "hourly",
        timestamp: "2024-01-15T14-30-22-123Z",
      });
    });

    test("returns null for file archive names", () => {
      const result = parseVolumeArchiveName("backitup_app_daily_2024-01-15_143022_abc123.tar.gz");
      expect(result).toBeNull();
    });

    test("returns null for invalid names", () => {
      expect(parseVolumeArchiveName("invalid.tar.gz")).toBeNull();
      expect(parseVolumeArchiveName("")).toBeNull();
    });
  });

  describe("isVolumeArchiveName", () => {
    test("returns true for volume archive names", () => {
      expect(
        isVolumeArchiveName("backitup-volume-data-daily-2024-01-15T14-30-22-123Z.tar.gz"),
      ).toBe(true);
    });

    test("returns false for file archive names", () => {
      expect(isVolumeArchiveName("backitup_app_daily_2024-01-15_143022_abc123.tar.gz")).toBe(false);
    });

    test("returns false for invalid names", () => {
      expect(isVolumeArchiveName("random.tar.gz")).toBe(false);
    });
  });

  describe("isValidArchiveName with volumes", () => {
    test("validates both file and volume archive names", () => {
      // File archive
      expect(isValidArchiveName("backitup_app_daily_2024-01-15_143022_abc123.tar.gz")).toBe(true);

      // Volume archive
      expect(isValidArchiveName("backitup-volume-data-daily-2024-01-15T14-30-22-123Z.tar.gz")).toBe(
        true,
      );
    });

    test("validates volume archives with custom prefix", () => {
      expect(
        isValidArchiveName("myapp-volume-data-daily-2024-01-15T14-30-22-123Z.tar.gz", "myapp"),
      ).toBe(true);

      expect(
        isValidArchiveName("myapp-volume-data-daily-2024-01-15T14-30-22-123Z.tar.gz", "backitup"),
      ).toBe(false);
    });

    test("rejects invalid archives", () => {
      expect(isValidArchiveName("invalid.tar.gz")).toBe(false);
    });
  });
});
