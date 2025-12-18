import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as os from "node:os";
import * as path from "node:path";
import { $ } from "bun";
import {
  getAllMigrations,
  getCurrentVersion,
  getLatestVersion,
  getPendingMigrations,
  initializeDatabase,
  runMigrations,
} from "../../src/db/migrations";

describe("migrations", () => {
  let tempDir: string;
  let db: Database;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `backitup-migrations-test-${Date.now()}`);
    await $`mkdir -p ${tempDir}`;
  });

  afterEach(async () => {
    if (db) {
      db.close();
    }
    await $`rm -rf ${tempDir}`.quiet();
  });

  describe("getAllMigrations", () => {
    test("returns all migrations", () => {
      const migrations = getAllMigrations();

      expect(migrations.length).toBeGreaterThanOrEqual(1);
      expect(migrations[0]!.version).toBe(1);
      expect(migrations[0]!.name).toBe("initial");
    });

    test("returns migrations sorted by version", () => {
      const migrations = getAllMigrations();

      for (let i = 1; i < migrations.length; i++) {
        expect(migrations[i]!.version).toBeGreaterThan(migrations[i - 1]!.version);
      }
    });

    test("each migration has required fields", () => {
      const migrations = getAllMigrations();

      for (const migration of migrations) {
        expect(migration.version).toBeGreaterThan(0);
        expect(migration.name).toBeTruthy();
        expect(migration.description).toBeTruthy();
        expect(migration.up).toBeTruthy();
      }
    });
  });

  describe("getLatestVersion", () => {
    test("returns the latest migration version", () => {
      const latest = getLatestVersion();
      const migrations = getAllMigrations();

      expect(latest).toBe(migrations[migrations.length - 1]!.version);
    });

    test("returns version 1 for current migrations", () => {
      const latest = getLatestVersion();

      expect(latest).toBe(1);
    });
  });

  describe("getPendingMigrations", () => {
    test("returns all migrations when current version is 0", () => {
      const pending = getPendingMigrations(0);

      expect(pending.length).toBe(getAllMigrations().length);
    });

    test("returns no migrations when at latest version", () => {
      const latest = getLatestVersion();
      const pending = getPendingMigrations(latest);

      expect(pending.length).toBe(0);
    });
  });

  describe("getCurrentVersion", () => {
    test("returns 0 for database without schema_version table", () => {
      db = new Database(path.join(tempDir, "empty.db"), { create: true });

      const version = getCurrentVersion(db);

      expect(version).toBe(0);
    });

    test("returns correct version from schema_version table", () => {
      db = new Database(path.join(tempDir, "versioned.db"), { create: true });
      db.run(`
        CREATE TABLE schema_version (
          version INTEGER PRIMARY KEY,
          applied_at TEXT DEFAULT (datetime('now'))
        )
      `);
      db.run("INSERT INTO schema_version (version) VALUES (1)");

      const version = getCurrentVersion(db);

      expect(version).toBe(1);
    });

    test("returns max version when multiple versions exist", () => {
      db = new Database(path.join(tempDir, "multi.db"), { create: true });
      db.run(`
        CREATE TABLE schema_version (
          version INTEGER PRIMARY KEY,
          applied_at TEXT DEFAULT (datetime('now'))
        )
      `);
      db.run("INSERT INTO schema_version (version) VALUES (1)");
      db.run("INSERT INTO schema_version (version) VALUES (2)");

      const version = getCurrentVersion(db);

      expect(version).toBe(2);
    });
  });

  describe("initializeDatabase", () => {
    test("creates all tables on fresh database", () => {
      db = new Database(path.join(tempDir, "fresh.db"), { create: true });

      initializeDatabase(db);

      const tables = db
        .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as { name: string }[];
      const tableNames = tables.map((t) => t.name);

      expect(tableNames).toContain("backups");
      expect(tableNames).toContain("deletion_log");
      expect(tableNames).toContain("schema_version");
    });

    test("sets schema version to latest", () => {
      db = new Database(path.join(tempDir, "fresh2.db"), { create: true });

      initializeDatabase(db);

      const version = getCurrentVersion(db);
      expect(version).toBe(getLatestVersion());
    });

    test("creates indexes", () => {
      db = new Database(path.join(tempDir, "indexed.db"), { create: true });

      initializeDatabase(db);

      const indexes = db.query("SELECT name FROM sqlite_master WHERE type='index'").all() as {
        name: string;
      }[];
      const indexNames = indexes.map((i) => i.name);

      expect(indexNames).toContain("idx_backups_schedule_created");
      expect(indexNames).toContain("idx_backups_status");
      expect(indexNames).toContain("idx_backups_type");
    });

    test("enables WAL mode", () => {
      db = new Database(path.join(tempDir, "wal.db"), { create: true });

      initializeDatabase(db);

      const result = db.query("PRAGMA journal_mode").get() as {
        journal_mode: string;
      };
      expect(result.journal_mode).toBe("wal");
    });

    test("enables foreign keys", () => {
      db = new Database(path.join(tempDir, "fk.db"), { create: true });

      initializeDatabase(db);

      const result = db.query("PRAGMA foreign_keys").get() as {
        foreign_keys: number;
      };
      expect(result.foreign_keys).toBe(1);
    });

    test("is idempotent - can be called multiple times", () => {
      db = new Database(path.join(tempDir, "idempotent.db"), { create: true });

      initializeDatabase(db);
      initializeDatabase(db);

      const version = getCurrentVersion(db);
      expect(version).toBe(getLatestVersion());
    });
  });

  describe("runMigrations", () => {
    test("does nothing when already at latest version", () => {
      db = new Database(path.join(tempDir, "latest.db"), { create: true });
      initializeDatabase(db);

      const versionBefore = getCurrentVersion(db);
      runMigrations(db);
      const versionAfter = getCurrentVersion(db);

      expect(versionBefore).toBe(versionAfter);
    });
  });

  describe("migration content", () => {
    test("creates backups table with all columns", () => {
      db = new Database(path.join(tempDir, "schema.db"), { create: true });
      initializeDatabase(db);

      const columns = db.query("PRAGMA table_info(backups)").all() as {
        name: string;
      }[];
      const columnNames = columns.map((c) => c.name);

      expect(columnNames).toContain("id");
      expect(columnNames).toContain("backup_id");
      expect(columnNames).toContain("schedule_name");
      expect(columnNames).toContain("archive_name");
      expect(columnNames).toContain("archive_size_bytes");
      expect(columnNames).toContain("archive_checksum");
      expect(columnNames).toContain("files_count");
      expect(columnNames).toContain("local_path");
      expect(columnNames).toContain("s3_bucket");
      expect(columnNames).toContain("s3_key");
      expect(columnNames).toContain("created_at");
      expect(columnNames).toContain("source_paths");
      expect(columnNames).toContain("status");
      expect(columnNames).toContain("backup_type");
      expect(columnNames).toContain("volume_name");
      expect(columnNames).toContain("volume_was_in_use");
    });

    test("creates deletion_log table", () => {
      db = new Database(path.join(tempDir, "deletion.db"), { create: true });
      initializeDatabase(db);

      const columns = db.query("PRAGMA table_info(deletion_log)").all() as {
        name: string;
      }[];
      const columnNames = columns.map((c) => c.name);

      expect(columnNames).toContain("id");
      expect(columnNames).toContain("backup_id");
      expect(columnNames).toContain("deletion_type");
      expect(columnNames).toContain("reason");
      expect(columnNames).toContain("deleted_at");
      expect(columnNames).toContain("success");
    });
  });
});
