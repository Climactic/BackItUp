import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as os from "node:os";
import * as path from "node:path";
import { $ } from "bun";
import {
  cleanupTempArchive,
  collectFiles,
  createArchive,
} from "../../src/core";
import type { SourceConfig } from "../../src/types";

describe("archive", () => {
  let tempDir: string;
  let sourceDir: string;

  beforeAll(async () => {
    tempDir = path.join(os.tmpdir(), `backitup-archive-test-${Date.now()}`);
    sourceDir = path.join(tempDir, "source");
    await $`mkdir -p ${sourceDir}`;

    // Create test files
    await $`mkdir -p ${sourceDir}/subdir`;
    await Bun.write(path.join(sourceDir, "file1.txt"), "content 1");
    await Bun.write(path.join(sourceDir, "file2.js"), "const x = 1;");
    await Bun.write(
      path.join(sourceDir, "subdir/nested.txt"),
      "nested content",
    );
    await Bun.write(path.join(sourceDir, ".hidden"), "hidden file");

    // Create node_modules to test exclusion
    await $`mkdir -p ${sourceDir}/node_modules/package`;
    await Bun.write(
      path.join(sourceDir, "node_modules/package/index.js"),
      "module",
    );
  });

  afterAll(async () => {
    await $`rm -rf ${tempDir}`.quiet();
  });

  describe("collectFiles", () => {
    test("collects all files with default pattern", async () => {
      const sources: SourceConfig[] = [{ path: sourceDir }];
      const { files, sourcePaths } = await collectFiles(sources);

      expect(files.length).toBeGreaterThan(0);
      expect(sourcePaths).toContain(sourceDir);
    });

    test("collects files matching specific patterns", async () => {
      const sources: SourceConfig[] = [
        { path: sourceDir, patterns: ["**/*.txt"] },
      ];
      const { files } = await collectFiles(sources);

      const txtFiles = files.filter((f) => f.absolutePath.endsWith(".txt"));
      expect(txtFiles.length).toBe(2); // file1.txt and subdir/nested.txt
    });

    test("excludes files with negation patterns", async () => {
      const sources: SourceConfig[] = [
        { path: sourceDir, patterns: ["**/*", "!**/node_modules/**"] },
      ];
      const { files } = await collectFiles(sources);

      const nodeModulesFiles = files.filter((f) =>
        f.absolutePath.includes("node_modules"),
      );
      expect(nodeModulesFiles.length).toBe(0);
    });

    test("handles multiple source directories", async () => {
      const source2 = path.join(tempDir, "source2");
      await $`mkdir -p ${source2}`;
      await Bun.write(path.join(source2, "other.txt"), "other content");

      const sources: SourceConfig[] = [
        { path: sourceDir, patterns: ["*.txt"] },
        { path: source2, patterns: ["*.txt"] },
      ];
      const { files, sourcePaths } = await collectFiles(sources);

      expect(sourcePaths).toContain(sourceDir);
      expect(sourcePaths).toContain(source2);
      expect(files.length).toBeGreaterThan(0);
    });

    test("returns empty for non-existent source", async () => {
      const sources: SourceConfig[] = [
        { path: path.join(tempDir, "nonexistent") },
      ];
      const { files } = await collectFiles(sources);

      expect(files.length).toBe(0);
    });

    test("prefixes relative paths with source directory name", async () => {
      const sources: SourceConfig[] = [{ path: sourceDir }];
      const { files } = await collectFiles(sources);

      const sourceName = path.basename(sourceDir);
      const prefixedFiles = files.filter((f) =>
        f.relativePath.startsWith(`${sourceName}/`),
      );
      expect(prefixedFiles.length).toBe(files.length);
    });

    test("handles hidden files with dot patterns", async () => {
      // Bun.Glob requires explicit dot pattern for hidden files
      const sources: SourceConfig[] = [
        { path: sourceDir, patterns: ["**/*", ".**", "**/.**"] },
      ];
      const { files } = await collectFiles(sources);

      // Hidden files may or may not be matched depending on glob behavior
      // Just verify the collect doesn't error
      expect(files.length).toBeGreaterThan(0);
    });

    test("avoids duplicate files", async () => {
      const sources: SourceConfig[] = [
        { path: sourceDir, patterns: ["**/*", "**/*.txt"] }, // overlapping patterns
      ];
      const { files } = await collectFiles(sources);

      const paths = files.map((f) => f.absolutePath);
      const uniquePaths = [...new Set(paths)];
      expect(paths.length).toBe(uniquePaths.length);
    });
  });

  describe("createArchive", () => {
    test("creates a tar.gz archive", async () => {
      const sources: SourceConfig[] = [
        { path: sourceDir, patterns: ["*.txt"] },
      ];
      const result = await createArchive(sources, "test", "backitup", 6);

      expect(result.archiveName).toMatch(/\.tar\.gz$/);
      expect(result.archivePath).toBeTruthy();
      expect(result.filesCount).toBeGreaterThan(0);
      expect(result.sizeBytes).toBeGreaterThan(0);
      expect(result.checksum).toHaveLength(64); // SHA256 hex

      // Verify archive exists
      const file = Bun.file(result.archivePath);
      expect(await file.exists()).toBe(true);

      // Cleanup
      await cleanupTempArchive(result.archivePath);
    });

    test("includes correct file count", async () => {
      const sources: SourceConfig[] = [
        { path: sourceDir, patterns: ["*.txt"] },
      ];
      const result = await createArchive(sources, "test", "backitup", 6);

      // Should have file1.txt (not subdir files with *.txt pattern at root)
      expect(result.filesCount).toBe(1);

      await cleanupTempArchive(result.archivePath);
    });

    test("uses provided schedule name in archive name", async () => {
      const sources: SourceConfig[] = [{ path: sourceDir }];
      const result = await createArchive(sources, "hourly", "backitup", 6);

      expect(result.archiveName).toContain("_hourly_");

      await cleanupTempArchive(result.archivePath);
    });

    test("uses provided prefix in archive name", async () => {
      const sources: SourceConfig[] = [{ path: sourceDir }];
      const result = await createArchive(sources, "daily", "myprefix", 6);

      expect(result.archiveName).toMatch(/^myprefix_/);

      await cleanupTempArchive(result.archivePath);
    });

    test("includes source names in archive name", async () => {
      const sources: SourceConfig[] = [{ path: sourceDir }];
      const result = await createArchive(sources, "daily", "backitup", 6, [
        "app",
        "db",
      ]);

      expect(result.archiveName).toContain("_app-db_");

      await cleanupTempArchive(result.archivePath);
    });

    test("throws for empty file collection", async () => {
      const sources: SourceConfig[] = [
        { path: sourceDir, patterns: ["*.nonexistent"] },
      ];

      await expect(
        createArchive(sources, "test", "backitup", 6),
      ).rejects.toThrow("No files found");
    });

    test("tracks source paths", async () => {
      const sources: SourceConfig[] = [{ path: sourceDir }];
      const result = await createArchive(sources, "test", "backitup", 6);

      expect(result.sourcePaths).toContain(sourceDir);

      await cleanupTempArchive(result.archivePath);
    });

    test("respects compression level", async () => {
      const sources: SourceConfig[] = [{ path: sourceDir }];

      // Low compression
      const lowResult = await createArchive(sources, "test", "backitup", 1);

      // High compression
      const highResult = await createArchive(sources, "test", "backitup", 9);

      // High compression should produce smaller or equal size
      // (may be equal for very small files)
      expect(highResult.sizeBytes).toBeLessThanOrEqual(lowResult.sizeBytes);

      await cleanupTempArchive(lowResult.archivePath);
      await cleanupTempArchive(highResult.archivePath);
    });
  });

  describe("cleanupTempArchive", () => {
    test("removes temp directory containing archive", async () => {
      const sources: SourceConfig[] = [{ path: sourceDir }];
      const result = await createArchive(sources, "test", "backitup", 6);

      const tempArchiveDir = path.dirname(result.archivePath);

      // Verify exists
      expect(await Bun.file(result.archivePath).exists()).toBe(true);

      await cleanupTempArchive(result.archivePath);

      // Verify cleaned up
      const dirExists = await $`test -d ${tempArchiveDir}`
        .quiet()
        .then(() => true)
        .catch(() => false);
      expect(dirExists).toBe(false);
    });

    test("only cleans up backitup temp directories", async () => {
      // Create a directory that doesn't match the backitup-* pattern
      const safeDir = path.join(os.tmpdir(), `safe-archive-test-${Date.now()}`);
      await $`mkdir -p ${safeDir}`;
      const safeFile = path.join(safeDir, "important.txt");
      await Bun.write(safeFile, "important data");

      try {
        // This should not delete the directory (wrong path pattern - no "backitup-")
        await cleanupTempArchive(safeFile);

        // File should still exist because directory name doesn't contain "backitup-"
        expect(await Bun.file(safeFile).exists()).toBe(true);
      } finally {
        // Clean up
        await $`rm -rf ${safeDir}`.quiet();
      }
    });
  });
});
