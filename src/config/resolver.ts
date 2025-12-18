/**
 * Configuration path resolution and source resolution
 */

import * as path from "node:path";
import type { BackitupConfig, SourceConfig } from "../types";
import { ConfigError } from "./validator";

/**
 * Resolve relative paths in config to absolute paths
 */
export function resolvePaths(
  config: BackitupConfig,
  configPath: string,
): BackitupConfig {
  const configDir = path.dirname(path.resolve(configPath));

  // Resolve database path
  if (!path.isAbsolute(config.database.path)) {
    config.database.path = path.resolve(configDir, config.database.path);
  }

  // Resolve local backup path
  if (config.local.enabled && !path.isAbsolute(config.local.path)) {
    config.local.path = path.resolve(configDir, config.local.path);
  }

  return config;
}

/**
 * Get the sources for a specific schedule.
 * If the schedule specifies sources, return only those.
 * Otherwise, return all defined sources.
 */
export function getSourcesForSchedule(
  config: BackitupConfig,
  scheduleName: string,
): SourceConfig[] {
  const schedule = config.schedules[scheduleName];
  if (!schedule) {
    throw new ConfigError(`Schedule "${scheduleName}" not found`);
  }

  const sourceNames = schedule.sources ?? Object.keys(config.sources);

  return sourceNames.map((name) => {
    const source = config.sources[name];
    if (!source) {
      throw new ConfigError(
        `Source "${name}" referenced by schedule "${scheduleName}" not found`,
      );
    }
    return source;
  });
}

/**
 * Get source names for a specific schedule
 */
export function getSourceNamesForSchedule(
  config: BackitupConfig,
  scheduleName: string,
): string[] {
  const schedule = config.schedules[scheduleName];
  if (!schedule) {
    throw new ConfigError(`Schedule "${scheduleName}" not found`);
  }

  return schedule.sources ?? Object.keys(config.sources);
}
