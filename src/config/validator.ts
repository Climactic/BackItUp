/**
 * Configuration validation
 */

import type { BackitupConfig } from "../types";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

type Validator = (config: Record<string, unknown>, sources?: string[]) => void;

const validators: Record<string, Validator> = {
  version: (c) => {
    if (!c.version || typeof c.version !== "string") {
      throw new ConfigError("Config must have a 'version' field");
    }
  },

  docker: (c) => {
    if (!c.docker) {
      return; // Docker config is optional
    }
    if (typeof c.docker !== "object") {
      throw new ConfigError("docker must be an object");
    }
    const docker = c.docker as Record<string, unknown>;
    if (typeof docker.enabled !== "boolean") {
      throw new ConfigError("docker.enabled must be a boolean");
    }
    if (docker.enabled) {
      if (!Array.isArray(docker.volumes)) {
        throw new ConfigError(
          "docker.volumes must be an array when docker.enabled is true",
        );
      }
      for (let i = 0; i < docker.volumes.length; i++) {
        const vol = docker.volumes[i] as Record<string, unknown>;
        if (!vol || typeof vol !== "object") {
          throw new ConfigError(`docker.volumes[${i}] must be an object`);
        }
        if (!vol.name || typeof vol.name !== "string") {
          throw new ConfigError(`docker.volumes[${i}].name must be a string`);
        }
        if (
          vol.type !== undefined &&
          vol.type !== "volume" &&
          vol.type !== "compose"
        ) {
          throw new ConfigError(
            `docker.volumes[${i}].type must be 'volume' or 'compose'`,
          );
        }
        if (
          vol.type === "compose" &&
          (!vol.composePath || typeof vol.composePath !== "string")
        ) {
          throw new ConfigError(
            `docker.volumes[${i}].composePath is required when type is 'compose'`,
          );
        }
      }
    }
  },

  database: (c) => {
    if (!c.database || typeof c.database !== "object") {
      throw new ConfigError("Config must have a 'database' section");
    }
    const db = c.database as Record<string, unknown>;
    if (!db.path || typeof db.path !== "string") {
      throw new ConfigError("database.path must be a string");
    }
  },

  sources: (c) => {
    if (
      !c.sources ||
      typeof c.sources !== "object" ||
      Array.isArray(c.sources)
    ) {
      throw new ConfigError(
        "Config must have a 'sources' object with named sources",
      );
    }
    const entries = Object.entries(c.sources as Record<string, unknown>);
    if (entries.length === 0) {
      throw new ConfigError("Config must have at least one source");
    }
    for (const [name, source] of entries) {
      if (!source || typeof source !== "object") {
        throw new ConfigError(`sources.${name} must be an object`);
      }
      const s = source as Record<string, unknown>;
      if (!s.path || typeof s.path !== "string") {
        throw new ConfigError(`sources.${name}.path must be a string`);
      }
      if (s.patterns !== undefined && !Array.isArray(s.patterns)) {
        throw new ConfigError(`sources.${name}.patterns must be an array`);
      }
      if (s.s3Prefix !== undefined && typeof s.s3Prefix !== "string") {
        throw new ConfigError(`sources.${name}.s3Prefix must be a string`);
      }
    }
  },

  local: (c) => {
    if (!c.local || typeof c.local !== "object") {
      throw new ConfigError("Config must have a 'local' section");
    }
    const local = c.local as Record<string, unknown>;
    if (typeof local.enabled !== "boolean") {
      throw new ConfigError("local.enabled must be a boolean");
    }
    if (local.enabled && (!local.path || typeof local.path !== "string")) {
      throw new ConfigError(
        "local.path must be a string when local.enabled is true",
      );
    }
  },

  s3: (c) => {
    if (!c.s3 || typeof c.s3 !== "object") {
      throw new ConfigError("Config must have an 's3' section");
    }
    const s3 = c.s3 as Record<string, unknown>;
    if (typeof s3.enabled !== "boolean") {
      throw new ConfigError("s3.enabled must be a boolean");
    }
    if (s3.enabled && (!s3.bucket || typeof s3.bucket !== "string")) {
      throw new ConfigError(
        "s3.bucket must be a string when s3.enabled is true",
      );
    }
  },

  schedules: (c, sourceNames) => {
    if (!c.schedules || typeof c.schedules !== "object") {
      throw new ConfigError("Config must have a 'schedules' section");
    }
    for (const [name, schedule] of Object.entries(
      c.schedules as Record<string, unknown>,
    )) {
      validateSchedule(name, schedule, sourceNames ?? []);
    }
  },

  storage: (c) => {
    const local = c.local as Record<string, unknown> | undefined;
    const s3 = c.s3 as Record<string, unknown> | undefined;
    if (!local?.enabled && !s3?.enabled) {
      throw new ConfigError(
        "At least one storage (local or s3) must be enabled",
      );
    }
  },
};

function validateSchedule(
  name: string,
  schedule: unknown,
  sourceNames: string[],
): void {
  if (!schedule || typeof schedule !== "object") {
    throw new ConfigError(`schedules.${name} must be an object`);
  }

  const sched = schedule as Record<string, unknown>;

  if (!sched.cron || typeof sched.cron !== "string") {
    throw new ConfigError(`schedules.${name}.cron must be a string`);
  }

  if (!sched.retention || typeof sched.retention !== "object") {
    throw new ConfigError(`schedules.${name}.retention must be an object`);
  }

  const retention = sched.retention as Record<string, unknown>;
  if (typeof retention.maxCount !== "number" || retention.maxCount < 1) {
    throw new ConfigError(
      `schedules.${name}.retention.maxCount must be a positive number`,
    );
  }
  if (typeof retention.maxDays !== "number" || retention.maxDays < 1) {
    throw new ConfigError(
      `schedules.${name}.retention.maxDays must be a positive number`,
    );
  }

  if (sched.sources !== undefined) {
    if (!Array.isArray(sched.sources)) {
      throw new ConfigError(
        `schedules.${name}.sources must be an array of source names`,
      );
    }
    for (const sourceName of sched.sources as string[]) {
      if (typeof sourceName !== "string") {
        throw new ConfigError(
          `schedules.${name}.sources must contain only strings`,
        );
      }
      if (!sourceNames.includes(sourceName)) {
        throw new ConfigError(
          `schedules.${name}.sources references unknown source "${sourceName}"`,
        );
      }
    }
  }
}

/**
 * Validate a configuration object
 */
export function validateConfig(
  config: unknown,
): asserts config is BackitupConfig {
  if (!config || typeof config !== "object") {
    throw new ConfigError("Config must be an object");
  }

  const c = config as Record<string, unknown>;

  // Get source names for schedule validation
  const sourceNames =
    c.sources && typeof c.sources === "object"
      ? Object.keys(c.sources as Record<string, unknown>)
      : [];

  // Run all validators
  validators.version!(c);
  validators.database!(c);
  validators.sources!(c);
  validators.local!(c);
  validators.s3!(c);
  validators.schedules!(c, sourceNames);
  validators.storage!(c);
  validators.docker!(c);
}
