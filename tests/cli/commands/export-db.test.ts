import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { exportDbCommand } from "../../../src/cli/commands/export-db";
import { closeDatabase, initDatabase } from "../../../src/db/connection";

describe("export-db command", () => {
  let tempDir: string;
  let configPath: string;
  let dbPath: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `backitup-export-db-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
    await mkdir(path.join(tempDir, "data"), { recursive: true });

    dbPath = path.join(tempDir, "data", "backitup.db");
    configPath = path.join(tempDir, "backitup.config.yaml");

    // Create config file
    await writeFile(
      configPath,
      `
version: "1.0"
database:
  path: "${dbPath}"
sources:
  test:
    path: "${tempDir}"
local:
  enabled: true
  path: "${tempDir}/backups"
s3:
  enabled: false
  bucket: test
schedules:
  daily:
    cron: "0 2 * * *"
    retention:
      maxCount: 7
      maxDays: 14
`,
    );

    // Initialize database
    await initDatabase(dbPath);
    closeDatabase();
  });

  afterEach(async () => {
    closeDatabase();
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("successful exports", () => {
    test("exports database to specified path", async () => {
      const outputPath = path.join(tempDir, "backup.sqlite");

      const exitCode = await exportDbCommand([outputPath, "-c", configPath]);

      expect(exitCode).toBe(0);
      expect(await Bun.file(outputPath).exists()).toBe(true);
    });

    test("exported database has same size as original", async () => {
      const outputPath = path.join(tempDir, "backup.sqlite");

      await exportDbCommand([outputPath, "-c", configPath]);

      const originalSize = await Bun.file(dbPath).size;
      const exportedSize = await Bun.file(outputPath).size;
      expect(exportedSize).toBe(originalSize);
    });

    test("creates output directory if it doesn't exist", async () => {
      const outputPath = path.join(tempDir, "nested", "dir", "backup.sqlite");

      const exitCode = await exportDbCommand([outputPath, "-c", configPath]);

      expect(exitCode).toBe(0);
      expect(await Bun.file(outputPath).exists()).toBe(true);
    });

    test("overwrites existing file at output path", async () => {
      const outputPath = path.join(tempDir, "existing.sqlite");

      // Create existing file
      await writeFile(outputPath, "old content");

      const exitCode = await exportDbCommand([outputPath, "-c", configPath]);

      expect(exitCode).toBe(0);
      const content = await Bun.file(outputPath).arrayBuffer();
      expect(content.byteLength).toBeGreaterThan(11); // More than "old content"
    });
  });

  describe("error handling", () => {
    test("fails when output path not provided", async () => {
      const exitCode = await exportDbCommand(["-c", configPath]);

      expect(exitCode).toBe(1);
    });

    test("fails when database doesn't exist", async () => {
      // Use a config pointing to non-existent database
      const noDbConfigPath = path.join(tempDir, "no-db.config.yaml");
      await writeFile(
        noDbConfigPath,
        `
version: "1.0"
database:
  path: "${tempDir}/nonexistent/db.sqlite"
sources:
  test:
    path: "${tempDir}"
local:
  enabled: true
  path: "${tempDir}/backups"
s3:
  enabled: false
  bucket: test
schedules:
  daily:
    cron: "0 2 * * *"
    retention:
      maxCount: 7
      maxDays: 14
`,
      );

      const exitCode = await exportDbCommand([
        path.join(tempDir, "out.sqlite"),
        "-c",
        noDbConfigPath,
      ]);

      expect(exitCode).toBe(1);
    });

    test("fails when config file doesn't exist", async () => {
      const exitCode = await exportDbCommand([
        path.join(tempDir, "out.sqlite"),
        "-c",
        "/nonexistent/config.yaml",
      ]);

      expect(exitCode).toBe(1);
    });
  });

  describe("help option", () => {
    test("shows help with --help flag", async () => {
      const exitCode = await exportDbCommand(["--help"]);

      expect(exitCode).toBe(0);
    });

    test("shows help with -h flag", async () => {
      const exitCode = await exportDbCommand(["-h"]);

      expect(exitCode).toBe(0);
    });
  });

  describe("exported database integrity", () => {
    test("exported database can be opened", async () => {
      const outputPath = path.join(tempDir, "openable.sqlite");

      await exportDbCommand([outputPath, "-c", configPath]);

      // Try to open the exported database
      const { Database } = await import("bun:sqlite");
      const db = new Database(outputPath);
      const tables = db
        .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as { name: string }[];
      db.close();

      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain("backups");
      expect(tableNames).toContain("schema_version");
    });

    test("exported database preserves data", async () => {
      // Insert some data into the original database
      const { Database } = await import("bun:sqlite");
      const originalDb = new Database(dbPath);
      originalDb.run(
        `
        INSERT INTO backups (
          backup_id, schedule_name, archive_name, archive_size_bytes,
          archive_checksum, files_count, source_paths
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
        ["export-test-id", "daily", "test.tar.gz", 2048, "checksum123", 15, "/test/path"],
      );
      originalDb.close();

      const outputPath = path.join(tempDir, "with-data.sqlite");
      await exportDbCommand([outputPath, "-c", configPath]);

      // Check exported database has the data
      const exportedDb = new Database(outputPath);
      const row = exportedDb
        .query("SELECT backup_id, files_count FROM backups WHERE backup_id = ?")
        .get("export-test-id") as { backup_id: string; files_count: number } | null;
      exportedDb.close();

      expect(row).not.toBeNull();
      expect(row?.backup_id).toBe("export-test-id");
      expect(row?.files_count).toBe(15);
    });
  });
});
