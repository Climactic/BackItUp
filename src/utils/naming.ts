/**
 * Archive naming utilities
 */

import { generateShortId } from "./crypto";

// Re-export format utilities for backward compatibility
export { formatBytes, formatDuration } from "./format";

// Pattern: prefix_sources_schedule_date_time_shortid.tar.gz (file backups)
export const ARCHIVE_NAME_PATTERN =
  /^[a-z]+_[a-z0-9-]+_[a-z]+_\d{4}-\d{2}-\d{2}_\d{6}_[a-z0-9]+\.tar\.gz$/;

// Pattern: prefix-volume-volumename-schedule-timestamp.tar.gz (volume backups)
export const VOLUME_ARCHIVE_NAME_PATTERN =
  /^[a-z]+-volume-[a-zA-Z0-9_-]+-[a-z]+-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.tar\.gz$/;

export interface ParsedArchiveName {
  prefix: string;
  sources: string;
  schedule: string;
  date: string;
  time: string;
  shortId: string;
}

export interface ParsedVolumeArchiveName {
  prefix: string;
  volumeName: string;
  schedule: string;
  timestamp: string;
}

export function generateArchiveName(
  schedule: string,
  prefix: string = "backitup",
  sourceNames?: string[],
): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 19).replace(/:/g, "");
  const shortId = generateShortId();

  const sourcePart =
    sourceNames && sourceNames.length > 0 ? sourceNames.join("-") : "all";

  return `${prefix}_${sourcePart}_${schedule}_${date}_${time}_${shortId}.tar.gz`;
}

export function parseArchiveName(
  archiveName: string,
): ParsedArchiveName | null {
  const match = archiveName.match(
    /^([a-z]+)_([a-z0-9-]+)_([a-z]+)_(\d{4}-\d{2}-\d{2})_(\d{6})_([a-z0-9]+)\.tar\.gz$/,
  );

  if (!match) return null;

  return {
    prefix: match[1]!,
    sources: match[2]!,
    schedule: match[3]!,
    date: match[4]!,
    time: match[5]!,
    shortId: match[6]!,
  };
}

export function parseVolumeArchiveName(
  archiveName: string,
): ParsedVolumeArchiveName | null {
  const match = archiveName.match(
    /^([a-z]+)-volume-([a-zA-Z0-9_-]+)-([a-z]+)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.tar\.gz$/,
  );

  if (!match) return null;

  return {
    prefix: match[1]!,
    volumeName: match[2]!,
    schedule: match[3]!,
    timestamp: match[4]!,
  };
}

export function isValidArchiveName(
  archiveName: string,
  expectedPrefix: string = "backitup",
): boolean {
  // Check file backup pattern
  if (ARCHIVE_NAME_PATTERN.test(archiveName)) {
    const parsed = parseArchiveName(archiveName);
    return parsed !== null && parsed.prefix === expectedPrefix;
  }

  // Check volume backup pattern
  if (VOLUME_ARCHIVE_NAME_PATTERN.test(archiveName)) {
    const parsed = parseVolumeArchiveName(archiveName);
    return parsed !== null && parsed.prefix === expectedPrefix;
  }

  return false;
}

/**
 * Check if an archive name is for a volume backup
 */
export function isVolumeArchiveName(archiveName: string): boolean {
  return VOLUME_ARCHIVE_NAME_PATTERN.test(archiveName);
}
