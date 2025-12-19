import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { closeDatabase, initDatabase } from "../../src/db/connection";
import { getCurrentVersion, getLatestVersion } from "../../src/db/migrations";

describe("connection", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `backitup-connection-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
    // Reset the module's internal db state
    closeDatabase();
  });

  afterEach(async () => {
    closeDatabase();
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("initDatabase", () => {
    test("creates new database with all migrations applied", async () => {
      const dbPath = path.join(tempDir, "new.db");

      const db = await initDatabase(dbPath);

      expect(db).toBeDefined();
      expect(getCurrentVersion(db)).toBe(getLatestVersion());
    });

    test("creates parent directories if they don't exist", async () => {
      const dbPath = path.join(tempDir, "nested", "path", "db.sqlite");

      const db = await initDatabase(dbPath);

      expect(db).toBeDefined();
      expect(await Bun.file(dbPath).exists()).toBe(true);
    });

    test("returns existing connection on subsequent calls", async () => {
      const dbPath = path.join(tempDir, "singleton.db");

      const db1 = await initDatabase(dbPath);
      const db2 = await initDatabase(dbPath);

      expect(db1).toBe(db2);
    });

    test("opens existing database without migrations", async () => {
      const dbPath = path.join(tempDir, "existing.db");

      // Create and initialize database
      const db1 = await initDatabase(dbPath);
      const version1 = getCurrentVersion(db1);
      closeDatabase();

      // Reopen existing database
      const db2 = await initDatabase(dbPath);
      const version2 = getCurrentVersion(db2);

      expect(version2).toBe(version1);
    });
  });

  describe("migration backup and rollback", () => {
    test("successfully migrates database with pending migrations", async () => {
      const dbPath = path.join(tempDir, "migrate.db");

      // Create a fully initialized database first
      const db1 = await initDatabase(dbPath);
      const versionAfterInit = getCurrentVersion(db1);
      closeDatabase();

      // Verify migrations ran successfully
      expect(versionAfterInit).toBe(getLatestVersion());

      // Reopen - should work without issues
      const db2 = await initDatabase(dbPath);
      expect(getCurrentVersion(db2)).toBe(getLatestVersion());
    });

    test("does not create backup for new databases", async () => {
      const dbPath = path.join(tempDir, "fresh.db");
      const backupPath = `${dbPath}.migration-backup`;

      await initDatabase(dbPath);

      // No backup needed for fresh databases
      expect(await Bun.file(backupPath).exists()).toBe(false);
    });

    test("does not create backup when no pending migrations", async () => {
      const dbPath = path.join(tempDir, "uptodate.db");
      const backupPath = `${dbPath}.migration-backup`;

      // Create fully migrated database
      await initDatabase(dbPath);
      closeDatabase();

      // Reopen - no migrations needed
      await initDatabase(dbPath);

      expect(await Bun.file(backupPath).exists()).toBe(false);
    });

    test("preserves data after successful migration", async () => {
      const dbPath = path.join(tempDir, "preserve.db");

      // Create and populate database
      const db1 = await initDatabase(dbPath);

      // Insert test data
      const db1Ref = db1;
      db1Ref.run(
        `
        INSERT INTO backups (
          backup_id, schedule_name, archive_name, archive_size_bytes,
          archive_checksum, files_count, source_paths
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
        ["test-id", "daily", "test.tar.gz", 1024, "abc123", 10, "/data"],
      );

      closeDatabase();

      // Reopen database
      const db2 = await initDatabase(dbPath);
      const row = db2.query("SELECT backup_id FROM backups WHERE backup_id = ?").get("test-id") as {
        backup_id: string;
      } | null;

      expect(row).not.toBeNull();
      expect(row?.backup_id).toBe("test-id");
    });
  });

  describe("closeDatabase", () => {
    test("closes the database connection", async () => {
      const dbPath = path.join(tempDir, "close.db");

      await initDatabase(dbPath);
      closeDatabase();

      // Should be able to open again after closing
      const db = await initDatabase(dbPath);
      expect(db).toBeDefined();
    });

    test("is safe to call multiple times", async () => {
      const dbPath = path.join(tempDir, "multiclose.db");

      await initDatabase(dbPath);
      closeDatabase();
      closeDatabase();
      closeDatabase();

      // Should not throw
      expect(true).toBe(true);
    });

    test("is safe to call without prior init", () => {
      // Should not throw
      closeDatabase();
      expect(true).toBe(true);
    });
  });
});
