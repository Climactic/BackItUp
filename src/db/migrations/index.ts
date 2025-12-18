import type { Database } from "bun:sqlite";
import type { Migration } from "../../types/database";

import { migration as m0001 } from "./0001_initial";

const migrations: Migration[] = [m0001];

export function getAllMigrations(): Migration[] {
  return migrations.sort((a, b) => a.version - b.version);
}

export function getLatestVersion(): number {
  const all = getAllMigrations();
  const lastMigration = all[all.length - 1];
  return lastMigration ? lastMigration.version : 0;
}

export function getCurrentVersion(database: Database): number {
  try {
    const row = database
      .query("SELECT MAX(version) as version FROM schema_version")
      .get() as { version: number } | null;
    return row?.version ?? 0;
  } catch {
    return 0;
  }
}

export function getPendingMigrations(currentVersion: number): Migration[] {
  return getAllMigrations().filter((m) => m.version > currentVersion);
}

function runMigrationStatements(database: Database, sql: string): void {
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    database.run(stmt);
  }
}

export function runMigrations(database: Database): void {
  const currentVersion = getCurrentVersion(database);
  const pending = getPendingMigrations(currentVersion);

  for (const migration of pending) {
    runMigrationStatements(database, migration.up);
    database.run("INSERT INTO schema_version (version) VALUES (?)", [
      migration.version,
    ]);
  }
}

export function initializeDatabase(database: Database): void {
  database.run("PRAGMA journal_mode = WAL");
  database.run("PRAGMA foreign_keys = ON");

  const versionTable = database
    .query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'",
    )
    .get();

  if (!versionTable) {
    for (const migration of getAllMigrations()) {
      runMigrationStatements(database, migration.up);
      database.run("INSERT INTO schema_version (version) VALUES (?)", [
        migration.version,
      ]);
    }
  } else {
    runMigrations(database);
  }
}
