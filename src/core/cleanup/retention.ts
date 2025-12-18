/**
 * Retention policy logic
 */

import type { BackupRecord, RetentionConfig } from "../../types";

export interface CleanupCandidate {
  backup: BackupRecord;
  reason: "retention_count" | "retention_days";
}

/**
 * Get backups eligible for cleanup based on retention policy.
 */
export function getCleanupCandidates(
  backups: BackupRecord[],
  retention: RetentionConfig,
): CleanupCandidate[] {
  const candidates: CleanupCandidate[] = [];

  // Sort by created_at descending (newest first)
  const sorted = [...backups].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const cutoffDate = new Date(Date.now() - retention.maxDays * 24 * 60 * 60 * 1000);

  sorted.forEach((backup, index) => {
    const isOverCount = index >= retention.maxCount;
    const backupDate = new Date(backup.created_at);
    const isOverAge = backupDate < cutoffDate;

    if (isOverCount) {
      candidates.push({ backup, reason: "retention_count" });
    } else if (isOverAge) {
      candidates.push({ backup, reason: "retention_days" });
    }
  });

  return candidates;
}
