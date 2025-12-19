/**
 * Database connection management
 */

import { copyFile, unlink } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import { info, error as logError } from "../utils/logger";
import {
  getAllMigrations,
  getCurrentVersion,
  getPendingMigrations,
  initializeDatabase,
} from "./migrations";

let db: Database | null = null;

export async function initDatabase(dbPath: string): Promise<Database> {
  if (db) {
    return db;
  }

  // Ensure parent directory exists
  await mkdir(dirname(dbPath), { recursive: true });

  // Check if database exists and has pending migrations
  const dbFile = Bun.file(dbPath);
  const dbExists = await dbFile.exists();

  if (dbExists) {
    // Open temporarily to check migration status
    const tempDb = new Database(dbPath);
    const currentVersion = getCurrentVersion(tempDb);
    const pending = getPendingMigrations(currentVersion);
    tempDb.close();

    if (pending.length > 0) {
      // Backup before migrations
      const backupPath = `${dbPath}.migration-backup`;
      info(`Pending migrations detected (${pending.length}), creating backup...`);
      await copyFile(dbPath, backupPath);

      try {
        db = new Database(dbPath, { create: true });
        initializeDatabase(db);
        info(
          `Migrations completed successfully (v${currentVersion} -> v${getAllMigrations().slice(-1)[0]?.version})`,
        );

        // Remove backup on success
        await unlink(backupPath).catch(() => {});
      } catch (err) {
        logError(`Migration failed: ${(err as Error).message}`);
        info("Rolling back database from backup...");

        // Close failed database
        if (db) {
          db.close();
          db = null;
        }

        // Restore from backup
        await copyFile(backupPath, dbPath);
        await unlink(backupPath).catch(() => {});

        // Rethrow to let caller handle
        throw new Error(`Database migration failed and was rolled back: ${(err as Error).message}`);
      }

      return db;
    }
  }

  // No pending migrations or new database
  db = new Database(dbPath, { create: true });
  initializeDatabase(db);

  return db;
}

export function getDatabase(): Database {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
