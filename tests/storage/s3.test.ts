import { describe, expect, test } from "bun:test";
import { buildS3Key, isKeyWithinPrefix } from "../../src/storage/s3";

describe("S3 storage", () => {
  describe("buildS3Key", () => {
    test("builds key with global prefix and source folder", () => {
      const key = buildS3Key("backups", "documents", "archive.tar.gz");
      expect(key).toBe("backups/documents/archive.tar.gz");
    });

    test("builds key with only source folder (no global prefix)", () => {
      const key = buildS3Key(undefined, "documents", "archive.tar.gz");
      expect(key).toBe("documents/archive.tar.gz");
    });

    test("builds key with only global prefix (empty source folder)", () => {
      const key = buildS3Key("backups", "", "archive.tar.gz");
      expect(key).toBe("backups/archive.tar.gz");
    });

    test("builds key with no prefix and no source folder", () => {
      const key = buildS3Key(undefined, "", "archive.tar.gz");
      expect(key).toBe("archive.tar.gz");
    });

    test("normalizes trailing slash in global prefix", () => {
      const key = buildS3Key("backups/", "documents", "archive.tar.gz");
      expect(key).toBe("backups/documents/archive.tar.gz");
    });

    test("normalizes trailing slash in source folder", () => {
      const key = buildS3Key("backups", "documents/", "archive.tar.gz");
      expect(key).toBe("backups/documents/archive.tar.gz");
    });

    test("normalizes trailing slashes in both prefix and folder", () => {
      const key = buildS3Key("backups/", "documents/", "archive.tar.gz");
      expect(key).toBe("backups/documents/archive.tar.gz");
    });

    test("handles nested global prefix", () => {
      const key = buildS3Key("prod/backups", "app", "archive.tar.gz");
      expect(key).toBe("prod/backups/app/archive.tar.gz");
    });

    test("handles nested source folder", () => {
      const key = buildS3Key("backups", "app/data", "archive.tar.gz");
      expect(key).toBe("backups/app/data/archive.tar.gz");
    });

    test("handles multi-source folder name (joined with dash)", () => {
      const key = buildS3Key("backups", "app-db-cache", "archive.tar.gz");
      expect(key).toBe("backups/app-db-cache/archive.tar.gz");
    });

    test("handles volume folder format", () => {
      const key = buildS3Key("backups", "volumes/postgres-data", "volume.tar.gz");
      expect(key).toBe("backups/volumes/postgres-data/volume.tar.gz");
    });
  });

  describe("isKeyWithinPrefix", () => {
    test("returns true when key starts with prefix", () => {
      expect(isKeyWithinPrefix("backups/file.tar.gz", "backups")).toBe(true);
      expect(isKeyWithinPrefix("backups/app/file.tar.gz", "backups")).toBe(true);
    });

    test("returns true when no prefix is set", () => {
      expect(isKeyWithinPrefix("any/key/here.tar.gz", undefined)).toBe(true);
    });

    test("returns false when key does not start with prefix", () => {
      expect(isKeyWithinPrefix("other/file.tar.gz", "backups")).toBe(false);
    });

    test("handles prefix with trailing slash", () => {
      expect(isKeyWithinPrefix("backups/file.tar.gz", "backups/")).toBe(true);
    });

    test("does not match partial prefix names", () => {
      // "backups-old/file.tar.gz" should not match prefix "backups"
      // because the normalized prefix is "backups/" and the key doesn't start with it
      expect(isKeyWithinPrefix("backups-old/file.tar.gz", "backups")).toBe(false);
    });
  });
});
