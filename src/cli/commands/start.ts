import { parseArgs } from "node:util";
import {
  ConfigError,
  canRunWithoutConfigFile,
  createConfigFromInlineOptions,
  extractInlineOptions,
  findAndLoadConfig,
  hasInlineOptions,
  INLINE_CONFIG_OPTIONS,
  mergeInlineConfig,
  validateInlineOptionsForConfigFreeMode,
} from "../../config/loader";
import { Scheduler } from "../../core";
import { setLogLevel } from "../../utils/logger";
import { color, ui } from "../ui";

export async function startCommand(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      config: { type: "string", short: "c" },
      verbose: { type: "boolean", short: "v", default: false },
      help: { type: "boolean", short: "h", default: false },
      // Inline config options
      ...INLINE_CONFIG_OPTIONS,
    },
    allowPositionals: false,
  });

  if (values.help) {
    printHelp();
    return 0;
  }

  if (values.verbose) {
    setLogLevel("debug");
  }

  try {
    const inlineOptions = extractInlineOptions(values as Record<string, unknown>);
    let config;

    // Try to load config file, or use inline options if sufficient
    try {
      config = await findAndLoadConfig(values.config);
      // Apply inline config overrides
      if (hasInlineOptions(inlineOptions)) {
        config = mergeInlineConfig(config, inlineOptions);
      }
    } catch (error) {
      // If no config file found, try to use inline options
      if (error instanceof ConfigError && !values.config) {
        if (canRunWithoutConfigFile(inlineOptions)) {
          config = createConfigFromInlineOptions(inlineOptions);
        } else {
          // Show what's missing
          const validation = validateInlineOptionsForConfigFreeMode(inlineOptions);
          ui.error("No config file found and inline options are insufficient:");
          for (const err of validation.errors) {
            ui.message(`  - ${err}`);
          }
          ui.info("\nEither create a config file or provide required inline options.");
          ui.info("Required: --source (or --docker-volume) AND (--local-path or --s3-bucket)");
          return 1;
        }
      } else {
        throw error;
      }
    }

    ui.intro("backitup scheduler");

    if (Object.keys(config.schedules).length === 0) {
      ui.error("No schedules configured");
      ui.info("Add schedules to your config file to use the scheduler");
      return 1;
    }

    const scheduler = new Scheduler(config);

    // Print schedule info
    const status = scheduler.getStatus();

    ui.step("Configured schedules:");
    for (const s of status) {
      const nextRun = s.nextRun ? s.nextRun.toLocaleString() : "unknown";
      ui.message(
        `  ${color.cyan(s.name.padEnd(12))} ${color.dim(s.cron.padEnd(15))} ${color.dim("next:")} ${nextRun}`,
      );
    }

    // Handle shutdown signals
    const shutdown = () => {
      ui.cancel("Shutting down...");
      scheduler.stop();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Start the scheduler
    scheduler.start();

    ui.success("Scheduler is running");
    ui.info("Press Ctrl+C to stop");

    // Keep the process running
    await new Promise(() => {}); // Never resolves

    return 0;
  } catch (error) {
    ui.error(`Failed to start: ${(error as Error).message}`);
    if (values.verbose) {
      console.error(error);
    }
    return 1;
  }
}

function printHelp(): void {
  console.log(`
${color.bold("backitup start")} - Start the scheduler daemon

${color.dim("USAGE:")}
  backitup start [OPTIONS]

${color.dim("OPTIONS:")}
  -c, --config <path>     Path to config file (default: ./backitup.config.yaml)
  -v, --verbose           Verbose output
  -h, --help              Show this help message

${color.dim("INLINE CONFIG OPTIONS:")}
      --database <path>            Database file path
      --source <path>              Source path to backup (can be repeated)
      --pattern <glob>             Glob pattern for filtering (can be repeated)
      --local-path <path>          Local storage path
      --no-local                   Disable local storage
      --s3-bucket <name>           S3 bucket name
      --s3-prefix <prefix>         S3 key prefix
      --s3-region <region>         S3 region
      --s3-endpoint <url>          S3-compatible endpoint URL
      --s3-access-key-id <key>     S3 access key ID
      --s3-secret-access-key <key> S3 secret access key
      --no-s3                      Disable S3 storage
      --retention-count <n>        Maximum number of backups to keep
      --retention-days <n>         Maximum days to retain backups
      --archive-prefix <str>       Archive filename prefix (default: backitup)
      --compression <0-9>          Compression level (default: 6)
      --verify-before-delete       Verify checksums before cleanup
      --no-verify-before-delete    Skip checksum verification on cleanup
      --docker                     Enable Docker volume backups
      --no-docker                  Disable Docker volume backups
      --docker-volume <name>       Docker volume to backup (can be repeated)

${color.dim("DESCRIPTION:")}
  Starts BackItUp as a long-running daemon that executes backups according to
  the schedules defined in your configuration file. After each backup, the
  cleanup process runs automatically to enforce retention policies.

${color.dim("SCHEDULE FORMAT:")}
  Schedules use standard cron format: minute hour day-of-month month day-of-week

  Examples:
    "0 * * * *"     - Every hour at minute 0
    "0 2 * * *"     - Every day at 2:00 AM
    "0 3 * * 0"     - Every Sunday at 3:00 AM
    "*/15 * * * *"  - Every 15 minutes

${color.dim("EXAMPLES:")}
  backitup start                           # Start with default config
  backitup start -c /etc/backitup.yaml     # Start with specific config
  backitup start -v                        # Start with verbose logging

${color.dim("INLINE CONFIG EXAMPLES:")}
  backitup start --source /data --local-path /backups
  backitup start --s3-bucket my-backups --s3-region us-west-2
`);
}
