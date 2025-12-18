import type { Migration } from "../../types/database";

export const migration: Migration = {
  version: 1,
  name: "initial",
  description: "Initial database schema with backups and deletion_log tables",
  up: `
CREATE TABLE backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    backup_id TEXT UNIQUE NOT NULL,
    schedule_name TEXT NOT NULL,
    archive_name TEXT NOT NULL,
    archive_size_bytes INTEGER NOT NULL,
    archive_checksum TEXT NOT NULL,
    files_count INTEGER NOT NULL,
    local_path TEXT,
    local_deleted_at TEXT,
    s3_bucket TEXT,
    s3_key TEXT,
    s3_deleted_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    source_paths TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    backup_type TEXT DEFAULT 'files',
    volume_name TEXT,
    volume_was_in_use INTEGER DEFAULT 0
);

CREATE INDEX idx_backups_schedule_created ON backups(schedule_name, created_at DESC);
CREATE INDEX idx_backups_status ON backups(status);
CREATE INDEX idx_backups_local_path ON backups(local_path) WHERE local_path IS NOT NULL;
CREATE INDEX idx_backups_s3 ON backups(s3_bucket, s3_key) WHERE s3_key IS NOT NULL;
CREATE INDEX idx_backups_type ON backups(backup_type);
CREATE INDEX idx_backups_volume ON backups(volume_name) WHERE volume_name IS NOT NULL;

CREATE TABLE deletion_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    backup_id TEXT NOT NULL,
    deletion_type TEXT NOT NULL,
    local_path TEXT,
    s3_bucket TEXT,
    s3_key TEXT,
    reason TEXT NOT NULL,
    deleted_at TEXT DEFAULT (datetime('now')),
    success INTEGER NOT NULL,
    error_message TEXT
);

CREATE TABLE schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT DEFAULT (datetime('now'))
);
`,
};
