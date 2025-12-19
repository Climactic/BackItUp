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
import { runBackup } from "../../core";
import { setLogLevel } from "../../utils/logger";
import { formatBytes, formatDuration } from "../../utils/naming";
import { color, formatSummary, ui } from "../ui";

export async function backupCommand(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      config: { type: "string", short: "c" },
      schedule: { type: "string", short: "s" },
      "dry-run": { type: "boolean", default: false },
      "local-only": { type: "boolean", default: false },
      "s3-only": { type: "boolean", default: false },
      "volumes-only": { type: "boolean", default: false },
      "skip-volumes": { type: "boolean", default: false },
      volume: { type: "string", multiple: true },
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

    // Determine schedule - interactive if not provided
    let schedule = values.schedule;

    if (!schedule) {
      // Interactive mode - prompt for schedule
      ui.intro("backitup backup");

      const scheduleOptions = [
        { value: "manual", label: "manual", hint: "One-time backup" },
        ...Object.entries(config.schedules).map(([name, cfg]) => ({
          value: name,
          label: name,
          hint: cfg.cron,
        })),
      ];

      const selected = await ui.select({
        message: "Select a schedule",
        options: scheduleOptions,
      });

      if (ui.isCancel(selected)) {
        ui.cancel("Backup cancelled");
        return 1;
      }

      schedule = selected as string;
    }

    // Validate schedule exists or is 'manual'
    if (schedule !== "manual" && !config.schedules[schedule]) {
      ui.error(`Unknown schedule: ${schedule}`);
      ui.info(`Available schedules: ${Object.keys(config.schedules).join(", ")}, manual`);
      return 1;
    }

    // Show intro if we didn't already (non-interactive mode)
    if (values.schedule) {
      ui.intro("backitup backup");
    }

    // Run backup with spinner
    const s = ui.spinner();
    s.start("Creating archive...");

    // For manual backups, use all sources
    const isManual = schedule === "manual";
    const sources = isManual ? Object.values(config.sources) : undefined;
    const sourceNames = isManual ? Object.keys(config.sources) : undefined;

    const result = await runBackup(config, {
      schedule,
      sources,
      sourceNames,
      dryRun: values["dry-run"],
      localOnly: values["local-only"],
      s3Only: values["s3-only"],
      volumesOnly: values["volumes-only"],
      skipVolumes: values["skip-volumes"],
      volumes: values.volume,
    });

    s.stop(values["volumes-only"] ? "Volume backup created" : "Archive created");

    // Show upload progress if applicable
    if (result.localPath || result.s3Key) {
      const uploadSpinner = ui.spinner();
      if (result.localPath && result.s3Key) {
        uploadSpinner.start("Saved to local and S3");
        uploadSpinner.stop("Saved to local and S3");
      } else if (result.localPath) {
        uploadSpinner.start("Saved to local storage");
        uploadSpinner.stop("Saved to local storage");
      } else if (result.s3Key) {
        uploadSpinner.start("Uploaded to S3");
        uploadSpinner.stop("Uploaded to S3");
      }
    }

    // Build summary
    const summaryItems = [
      { label: "Backup ID", value: result.backupId },
      { label: "Archive", value: result.archiveName || "(volumes only)" },
      { label: "Size", value: formatBytes(result.sizeBytes) },
      { label: "Files", value: result.filesCount.toString() },
      { label: "Duration", value: formatDuration(result.durationMs) },
      { label: "Local path", value: result.localPath },
      {
        label: "S3 location",
        value: result.s3Key ? `s3://${result.s3Bucket}/${result.s3Key}` : null,
      },
    ];

    // Add volume backup info if any
    if (result.volumeBackups && result.volumeBackups.length > 0) {
      summaryItems.push({
        label: "Volumes backed up",
        value: result.volumeBackups.length.toString(),
      });
      const totalVolumeSize = result.volumeBackups.reduce((sum, v) => sum + v.sizeBytes, 0);
      summaryItems.push({
        label: "Volume backup size",
        value: formatBytes(totalVolumeSize),
      });
      const volumeNames = result.volumeBackups.map((v) => v.volumeName).join(", ");
      summaryItems.push({
        label: "Volume names",
        value: volumeNames,
      });

      // Count containers that were stopped
      const stoppedContainers = result.volumeBackups
        .flatMap((v) => v.stoppedContainers || [])
        .filter((name, i, arr) => arr.indexOf(name) === i); // dedupe
      if (stoppedContainers.length > 0) {
        summaryItems.push({
          label: "Containers stopped",
          value: stoppedContainers.join(", "),
        });
      }

      // Check for failed restarts
      const failedRestarts = result.volumeBackups
        .flatMap((v) => v.failedToRestart || [])
        .filter((name, i, arr) => arr.indexOf(name) === i); // dedupe
      if (failedRestarts.length > 0) {
        summaryItems.push({
          label: "Failed to restart",
          value: `${failedRestarts.join(", ")} (manual restart required)`,
        });
      }

      // Check for auto-restart warnings
      const hadAutoRestartWarning = result.volumeBackups.some((v) => v.hadAutoRestartWarning);
      if (hadAutoRestartWarning) {
        summaryItems.push({
          label: "Warning",
          value: "Some containers had auto-restart policy",
        });
      }

      const inUseCount = result.volumeBackups.filter((v) => v.wasInUse).length;
      const stoppedCount = result.volumeBackups.filter(
        (v) => v.stoppedContainers && v.stoppedContainers.length > 0,
      ).length;
      // Only show "in use" warning if containers weren't stopped
      if (inUseCount > 0 && stoppedCount < inUseCount) {
        const notStoppedCount = inUseCount - stoppedCount;
        summaryItems.push({
          label: "Volumes in use",
          value: `${notStoppedCount} (data may be inconsistent)`,
        });
      }
    }

    ui.note(formatSummary(summaryItems), "Backup Summary");

    if (values["dry-run"]) {
      ui.warn("[DRY RUN] No changes were made.");
    }

    ui.outro("Backup complete!");
    return 0;
  } catch (error) {
    ui.error(`Backup failed: ${(error as Error).message}`);
    if (values.verbose) {
      console.error(error);
    }
    return 1;
  }
}

function printHelp(): void {
  console.log(`
${color.bold("backitup backup")} - Create a backup

${color.dim("USAGE:")}
  backitup backup [OPTIONS]

${color.dim("OPTIONS:")}
  -c, --config <path>     Path to config file (default: ./backitup.config.yaml)
  -s, --schedule <name>   Schedule name: hourly, daily, weekly, etc.
                          If not provided, you'll be prompted to select one.
      --dry-run           Show what would be backed up without doing it
      --local-only        Only save locally, skip S3
      --s3-only           Only upload to S3, skip local
      --volumes-only      Only backup Docker volumes (skip file sources)
      --skip-volumes      Skip Docker volume backups (only backup file sources)
      --volume <name>     Backup specific Docker volume(s) (can be repeated)
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

${color.dim("DOCKER CONTAINER OPTIONS:")}
      --stop-containers            Stop containers using volumes before backup
      --no-stop-containers         Keep containers running during backup (default)
      --stop-timeout <seconds>     Graceful stop timeout (default: 30)
      --restart-retries <n>        Restart retry attempts (default: 3)

${color.dim("IMPORTANT:")} When using --stop-containers, be aware that containers with
restart policy "always" or "unless-stopped" may auto-restart during backup.
Consider using "restart: on-failure" for cleaner backups.

${color.dim("EXAMPLES:")}
  backitup backup                          # Interactive schedule selection
  backitup backup -s manual                # Manual backup (non-interactive)
  backitup backup -s hourly                # Hourly backup
  backitup backup --dry-run                # Preview backup
  backitup backup --local-only             # Local only, no S3
  backitup backup --volumes-only           # Only backup Docker volumes
  backitup backup --skip-volumes           # Skip Docker volumes
  backitup backup --volume mydb_data       # Backup specific volume

${color.dim("INLINE CONFIG EXAMPLES:")}
  backitup backup -s manual --source /data --local-path /backups
  backitup backup -s manual --source /app --s3-bucket my-backups --no-local
  backitup backup -s manual --source /db --retention-count 5 --retention-days 7

${color.dim("DOCKER EXAMPLES:")}
  backitup backup -s manual --docker-volume mydb --stop-containers
  backitup backup -s manual --stop-containers --stop-timeout 60
  backitup backup -s manual --docker-volume postgres_data --stop-containers --restart-retries 5
`);
}
