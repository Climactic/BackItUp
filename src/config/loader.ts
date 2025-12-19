/**
 * Configuration file loading
 */

import * as path from "node:path";
import * as yaml from "js-yaml";
import type { BackitupConfig } from "../types";
import { DEFAULT_CONFIG, deepMerge } from "./defaults";
import { resolvePaths } from "./resolver";
import { ConfigError, validateConfig } from "./validator";

// Re-export inline config utilities
export {
  canRunWithoutConfigFile,
  createConfigFromInlineOptions,
  extractInlineOptions,
  hasInlineOptions,
  INLINE_CONFIG_OPTIONS,
  type InlineConfigOptions,
  type InlineValidationResult,
  mergeInlineConfig,
  validateInlineOptionsForConfigFreeMode,
} from "./inline";
// Re-export resolver functions for backward compatibility
export { getSourceNamesForSchedule, getSourcesForSchedule } from "./resolver";
export { ConfigError } from "./validator";

/**
 * Load and parse a config file
 */
export async function loadConfig(configPath: string): Promise<BackitupConfig> {
  const absolutePath = path.resolve(configPath);
  const file = Bun.file(absolutePath);

  if (!(await file.exists())) {
    throw new ConfigError(`Config file not found: ${absolutePath}`);
  }

  const content = await file.text();
  const ext = path.extname(absolutePath).toLowerCase();

  // Parse file content
  const parsed = parseConfigContent(content, ext);

  // Merge with defaults
  const merged = deepMerge(DEFAULT_CONFIG as object, parsed as object);

  // Validate
  validateConfig(merged);

  // Resolve paths
  return resolvePaths(merged as BackitupConfig, configPath);
}

function parseConfigContent(content: string, ext: string): unknown {
  if (ext === ".yaml" || ext === ".yml") {
    try {
      return yaml.load(content);
    } catch (e) {
      throw new ConfigError(`Failed to parse YAML: ${(e as Error).message}`);
    }
  }

  if (ext === ".json") {
    try {
      return JSON.parse(content);
    } catch (e) {
      throw new ConfigError(`Failed to parse JSON: ${(e as Error).message}`);
    }
  }

  throw new ConfigError(`Unsupported config file format: ${ext}. Use .yaml, .yml, or .json`);
}

/**
 * Check if running inside a Docker container
 */
function isRunningInDocker(): boolean {
  try {
    // Check for .dockerenv file (most reliable)
    if (Bun.file("/.dockerenv").size >= 0) {
      return true;
    }
  } catch {
    // File doesn't exist
  }

  try {
    // Check cgroup for docker/container references
    const cgroup = Bun.file("/proc/1/cgroup");
    if (cgroup.size > 0) {
      // We can't easily read sync here, so just check if the file exists
      // The /.dockerenv check above is the primary method
    }
  } catch {
    // Not on Linux or file not accessible
  }

  return false;
}

/**
 * Find a config file in the given directory or standard locations
 */
export function findConfigFile(startDir: string = process.cwd()): string | null {
  const configNames = ["backitup.config.yaml", "backitup.config.yml", "backitup.config.json"];
  const searchDirs = [startDir];

  // Only check /config when running in Docker
  if (isRunningInDocker()) {
    searchDirs.push("/config");
  }

  for (const dir of searchDirs) {
    for (const name of configNames) {
      const configPath = path.join(dir, name);
      try {
        if (Bun.file(configPath).size > 0) {
          return configPath;
        }
      } catch {
        // Directory doesn't exist or not accessible, continue
      }
    }
  }

  return null;
}

/**
 * Find and load a config file
 */
export async function findAndLoadConfig(configPath?: string): Promise<BackitupConfig> {
  if (configPath) {
    return loadConfig(configPath);
  }

  const found = findConfigFile();
  if (!found) {
    throw new ConfigError(
      "No config file found. Create backitup.config.yaml or specify --config path",
    );
  }

  return loadConfig(found);
}
