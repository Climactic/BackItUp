/**
 * Default configuration values
 */

import type { BackitupConfig } from "../types";

export const DEFAULT_CONFIG: Partial<BackitupConfig> = {
  // version is intentionally NOT defaulted - it must be specified by the user
  archive: {
    prefix: "backitup",
    compression: 6,
  },
  safety: {
    dryRun: false,
    verifyChecksumBeforeDelete: true,
  },
};

/**
 * Deep merge two objects, with source overriding target
 */
export function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (
      sourceValue !== undefined &&
      typeof sourceValue === "object" &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === "object" &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      (result as Record<string, unknown>)[key] = deepMerge(
        targetValue as object,
        sourceValue as object,
      );
    } else if (sourceValue !== undefined) {
      (result as Record<string, unknown>)[key] = sourceValue;
    }
  }

  return result;
}
