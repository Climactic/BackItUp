/**
 * Deletion log repository
 */

import type { DeletionLogRecord } from "../types";
import { getDatabase } from "./connection";

export type DeletionLogInsert = Omit<DeletionLogRecord, "id" | "deleted_at">;

export function logDeletion(log: DeletionLogInsert): void {
  const database = getDatabase();

  database.run(
    `INSERT INTO deletion_log (
      backup_id, deletion_type, local_path, s3_bucket, s3_key, reason, success, error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      log.backup_id,
      log.deletion_type,
      log.local_path ?? null,
      log.s3_bucket ?? null,
      log.s3_key ?? null,
      log.reason,
      log.success ? 1 : 0,
      log.error_message ?? null,
    ],
  );
}

export function getDeletionLogs(limit = 100): DeletionLogRecord[] {
  const database = getDatabase();
  return database
    .query("SELECT * FROM deletion_log ORDER BY deleted_at DESC LIMIT $limit")
    .all({ $limit: limit }) as DeletionLogRecord[];
}
