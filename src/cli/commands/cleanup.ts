import { parseArgs } from "node:util";
import { findAndLoadConfig } from "../../config/loader";
import { runCleanup } from "../../core";
import { setLogLevel } from "../../utils/logger";
import { color, formatSummary, ui } from "../ui";

export async function cleanupCommand(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      config: { type: "string", short: "c" },
      schedule: { type: "string", short: "s" },
      "dry-run": { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      verbose: { type: "boolean", short: "v", default: false },
      help: { type: "boolean", short: "h", default: false },
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
    const config = await findAndLoadConfig(values.config);

    ui.intro("backitup cleanup");

    // Validate schedule if specified
    if (values.schedule && !config.schedules[values.schedule]) {
      ui.error(`Unknown schedule: ${values.schedule}`);
      ui.info(
        `Available schedules: ${Object.keys(config.schedules).join(", ")}`,
      );
      return 1;
    }

    // Preview what will be deleted first
    const preview = await runCleanup(config, {
      schedule: values.schedule,
      dryRun: true,
      force: true,
    });

    if (preview.deletions.length === 0) {
      ui.success("No backups need to be cleaned up");
      ui.outro("Nothing to do");
      return 0;
    }

    // Show what will be deleted
    ui.step(`Found ${preview.deletions.length} backup(s) to delete:`);
    for (const deletion of preview.deletions) {
      const reason =
        deletion.reason === "retention_count" ? "count limit" : "age limit";
      ui.message(
        `  ${color.dim("•")} ${deletion.archiveName} ${color.dim(`(${reason})`)}`,
      );
    }

    // Confirm deletion unless --force or --dry-run
    if (!values.force && !values["dry-run"]) {
      const confirmed = await ui.confirm({
        message: `Delete ${preview.deletions.length} backup(s)?`,
        initialValue: false,
      });

      if (ui.isCancel(confirmed) || !confirmed) {
        ui.cancel("Cleanup cancelled");
        return 1;
      }
    }

    // Run the actual cleanup
    const s = ui.spinner();

    if (values["dry-run"]) {
      s.start("Previewing cleanup...");
      s.stop("Preview complete");

      ui.warn("[DRY RUN] No changes were made.");
    } else {
      s.start("Cleaning up old backups...");

      const result = await runCleanup(config, {
        schedule: values.schedule,
        dryRun: false,
        force: true, // We already confirmed
      });

      s.stop("Cleanup complete");

      // Show deletion results
      if (result.deletions.length > 0) {
        ui.step("Deletions:");
        for (const deletion of result.deletions) {
          const status = deletion.success
            ? color.green("OK")
            : color.red("FAILED");
          const reason =
            deletion.reason === "retention_count" ? "count limit" : "age limit";

          ui.message(
            `  [${status}] ${deletion.archiveName} ${color.dim(`(${reason})`)}`,
          );

          if (deletion.error) {
            ui.error(`         ${deletion.error}`);
          }
        }
      }

      // Summary
      const summaryItems = [
        { label: "Checked", value: result.totalChecked.toString() },
        { label: "Deleted", value: result.totalDeleted.toString() },
        { label: "Skipped", value: result.totalSkipped.toString() },
      ];

      ui.note(formatSummary(summaryItems), "Cleanup Summary");

      if (result.totalSkipped > 0) {
        ui.warn("Some backups were skipped due to validation errors");
        ui.outro("Cleanup finished with warnings");
        return 1;
      }
    }

    ui.outro("Cleanup complete!");
    return 0;
  } catch (error) {
    ui.error(`Cleanup failed: ${(error as Error).message}`);
    if (values.verbose) {
      console.error(error);
    }
    return 1;
  }
}

function printHelp(): void {
  console.log(`
${color.bold("backitup cleanup")} - Clean up old backups based on retention policy

${color.dim("USAGE:")}
  backitup cleanup [OPTIONS]

${color.dim("OPTIONS:")}
  -c, --config <path>     Path to config file (default: ./backitup.config.yaml)
  -s, --schedule <name>   Only cleanup specific schedule (optional)
      --dry-run           Show what would be deleted without doing it
      --force             Skip confirmation prompts
  -v, --verbose           Verbose output
  -h, --help              Show this help message

${color.dim("SECURITY:")}
  Cleanup ONLY deletes files that are tracked in the database and pass all
  security validation checks:

  1. Archive must exist in the BackItUp database
  2. Archive name must match the BackItUp naming pattern
  3. Local files must be within the configured backup directory
  4. S3 keys must match the configured bucket and prefix
  5. Checksums must match (if enabled in config)

  Any file that fails validation is SKIPPED and will not be deleted.

${color.dim("EXAMPLES:")}
  backitup cleanup                         # Cleanup all schedules (with confirmation)
  backitup cleanup -s hourly               # Cleanup hourly backups only
  backitup cleanup --dry-run               # Preview what would be deleted
  backitup cleanup --force                 # Skip confirmation
`);
}
