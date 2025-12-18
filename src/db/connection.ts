/**
 * Database connection management
 */

import { Database } from "bun:sqlite";
import { initializeDatabase } from "./migrations";

let db: Database | null = null;

export function initDatabase(dbPath: string): Database {
  if (db) {
    return db;
  }

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
