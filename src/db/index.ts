/**
 * Database module exports
 */

// Backup repository
export {
  getActiveBackupsBySchedule,
  getActiveBackupsByType,
  getActiveVolumeBackups,
  getActiveVolumeBackupsBySchedule,
  getAllActiveBackups,
  getBackupById,
  insertBackup,
  markBackupDeleted,
  updateBackupLocalPath,
  updateBackupS3,
} from "./backup-repository";

// Connection
export { closeDatabase, getDatabase, initDatabase } from "./connection";
export type { DeletionLogInsert } from "./deletion-log-repository";
// Deletion log repository
export { getDeletionLogs, logDeletion } from "./deletion-log-repository";
export type { RawBackupRow } from "./mappers";
// Mappers
export { parseBackupRow, serializeSourcePaths } from "./mappers";
// Migrations
export {
  getAllMigrations,
  getCurrentVersion,
  getLatestVersion,
  getPendingMigrations,
} from "./migrations";
