import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as os from "node:os";
import * as path from "node:path";
import { $ } from "bun";
import {
  deleteFromLocal,
  ensureLocalDir,
  getLocalFileChecksum,
  isPathWithinDir,
  localFileExists,
  saveToLocal,
} from "../../src/storage/local";

describe("local storage", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = path.join(os.tmpdir(), `backitup-local-test-${Date.now()}`);
    await $`mkdir -p ${tempDir}`;
  });

  afterAll(async () => {
    await $`rm -rf ${tempDir}`.quiet();
  });

  describe("ensureLocalDir", () => {
    test("creates directory if not exists", async () => {
      const newDir = path.join(tempDir, "new-dir");

      await ensureLocalDir(newDir);

      const exists = await $`test -d ${newDir}`
        .quiet()
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    test("does not error if directory already exists", async () => {
      const existingDir = path.join(tempDir, "existing-dir");
      await $`mkdir -p ${existingDir}`;

      await expect(ensureLocalDir(existingDir)).resolves.toBeUndefined();
    });

    test("creates nested directories", async () => {
      const nestedDir = path.join(tempDir, "level1/level2/level3");

      await ensureLocalDir(nestedDir);

      const exists = await $`test -d ${nestedDir}`
        .quiet()
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });
  });

  describe("saveToLocal", () => {
    test("copies file to destination", async () => {
      const sourceFile = path.join(tempDir, "source.txt");
      const destDir = path.join(tempDir, "dest");
      await Bun.write(sourceFile, "test content");
      await $`mkdir -p ${destDir}`;

      const destPath = await saveToLocal(sourceFile, destDir, "backup.txt");

      expect(destPath).toBe(path.join(destDir, "backup.txt"));
      const destContent = await Bun.file(destPath).text();
      expect(destContent).toBe("test content");
    });

    test("creates destination directory if not exists", async () => {
      const sourceFile = path.join(tempDir, "source2.txt");
      const destDir = path.join(tempDir, "auto-created");
      await Bun.write(sourceFile, "content");

      await saveToLocal(sourceFile, destDir, "file.txt");

      const exists = await $`test -d ${destDir}`
        .quiet()
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    test("verifies checksum after copy", async () => {
      const sourceFile = path.join(tempDir, "checksum-test.txt");
      const destDir = path.join(tempDir, "checksum-dest");
      await Bun.write(sourceFile, "important data");

      const destPath = await saveToLocal(sourceFile, destDir, "verified.txt");

      // Both files should have same content
      const sourceContent = await Bun.file(sourceFile).text();
      const destContent = await Bun.file(destPath).text();
      expect(sourceContent).toBe(destContent);
    });

    test("returns correct destination path", async () => {
      const sourceFile = path.join(tempDir, "path-test.txt");
      const destDir = path.join(tempDir, "path-dest");
      await Bun.write(sourceFile, "data");

      const result = await saveToLocal(sourceFile, destDir, "myfile.tar.gz");

      expect(result).toBe(path.join(destDir, "myfile.tar.gz"));
    });
  });

  describe("deleteFromLocal", () => {
    test("deletes existing file", async () => {
      const filePath = path.join(tempDir, "to-delete.txt");
      await Bun.write(filePath, "delete me");

      await deleteFromLocal(filePath);

      const exists = await Bun.file(filePath).exists();
      expect(exists).toBe(false);
    });

    test("handles non-existent file gracefully", async () => {
      const nonExistent = path.join(tempDir, "nonexistent-file.txt");

      // Should not throw
      await expect(deleteFromLocal(nonExistent)).resolves.toBeUndefined();
    });
  });

  describe("localFileExists", () => {
    test("returns true for existing file", async () => {
      const filePath = path.join(tempDir, "exists.txt");
      await Bun.write(filePath, "content");

      const exists = await localFileExists(filePath);

      expect(exists).toBe(true);
    });

    test("returns false for non-existent file", async () => {
      const filePath = path.join(tempDir, "does-not-exist.txt");

      const exists = await localFileExists(filePath);

      expect(exists).toBe(false);
    });

    test("returns true for empty file", async () => {
      const filePath = path.join(tempDir, "empty.txt");
      await Bun.write(filePath, "");

      const exists = await localFileExists(filePath);

      expect(exists).toBe(true);
    });
  });

  describe("getLocalFileChecksum", () => {
    test("returns checksum for existing file", async () => {
      const filePath = path.join(tempDir, "checksum.txt");
      await Bun.write(filePath, "hello world");

      const checksum = await getLocalFileChecksum(filePath);

      expect(checksum).toBe("b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9");
    });

    test("returns null for non-existent file", async () => {
      const filePath = path.join(tempDir, "no-checksum.txt");

      const checksum = await getLocalFileChecksum(filePath);

      expect(checksum).toBeNull();
    });

    test("returns consistent checksum", async () => {
      const filePath = path.join(tempDir, "consistent.txt");
      await Bun.write(filePath, "consistent content");

      const checksum1 = await getLocalFileChecksum(filePath);
      const checksum2 = await getLocalFileChecksum(filePath);

      expect(checksum1).toBe(checksum2);
    });
  });

  describe("isPathWithinDir", () => {
    test("returns true for file within directory", () => {
      expect(isPathWithinDir("/backup/archives/file.tar.gz", "/backup")).toBe(true);
      expect(isPathWithinDir("/backup/archives/file.tar.gz", "/backup/")).toBe(true);
      expect(isPathWithinDir("/backup/archives/file.tar.gz", "/backup/archives")).toBe(true);
    });

    test("returns false for file outside directory", () => {
      expect(isPathWithinDir("/other/file.tar.gz", "/backup")).toBe(false);
      expect(isPathWithinDir("/backup-other/file.tar.gz", "/backup")).toBe(false);
    });

    test("returns false for path traversal attempts", () => {
      expect(isPathWithinDir("/backup/../etc/passwd", "/backup")).toBe(false);
      expect(isPathWithinDir("/backup/archives/../../etc/passwd", "/backup")).toBe(false);
    });

    test("returns true for exact directory match", () => {
      expect(isPathWithinDir("/backup", "/backup")).toBe(true);
    });

    test("handles relative paths", () => {
      // These will be resolved to absolute paths
      expect(isPathWithinDir("./backup/file.txt", "./backup")).toBe(true);
    });

    test("returns false for similar directory names", () => {
      // /backup-extra should not be within /backup
      expect(isPathWithinDir("/backup-extra/file.txt", "/backup")).toBe(false);
    });

    test("handles nested directories", () => {
      expect(isPathWithinDir("/a/b/c/d/e/file.txt", "/a")).toBe(true);
      expect(isPathWithinDir("/a/b/c/d/e/file.txt", "/a/b")).toBe(true);
      expect(isPathWithinDir("/a/b/c/d/e/file.txt", "/a/b/c")).toBe(true);
    });
  });
});
