/**
 * Path validation and manipulation utilities
 */

import * as path from "node:path";

/**
 * Check if a file path is within an allowed directory.
 * Prevents path traversal attacks.
 */
export function isPathWithinDir(filePath: string, allowedDir: string): boolean {
  const normalizedPath = path.resolve(filePath);
  const normalizedDir = path.resolve(allowedDir);

  return (
    normalizedPath.startsWith(normalizedDir + path.sep) ||
    normalizedPath === normalizedDir
  );
}

/**
 * Ensure a path ends with a separator
 */
export function ensureTrailingSep(dirPath: string): string {
  return dirPath.endsWith(path.sep) ? dirPath : dirPath + path.sep;
}

/**
 * Get the base name without extension
 */
export function getBaseName(filePath: string): string {
  const base = path.basename(filePath);
  const ext = path.extname(base);
  return ext ? base.slice(0, -ext.length) : base;
}
