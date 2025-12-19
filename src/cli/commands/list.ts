import { parseArgs } from "node:util";
import { findAndLoadConfig } from "../../config/loader";
import {
  getActiveBackupsBySchedule,
  getActiveBackupsByType,
  getAllActiveBackups,
  initDatabase,
} from "../../db";
import type { BackupRecord } from "../../types";
import { setLogLevel } from "../../utils/logger";
import { formatBytes } from "../../utils/naming";
import { color, formatTableRow, formatTableSeparator, ui } from "../ui";

export async function listCommand(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      config: { type: "string", short: "c" },
      schedule: { type: "string", short: "s" },
      type: { type: "string", short: "t" },
      limit: { type: "string", short: "n" },
      format: { type: "string", default: "table" },
      all: { type: "boolean", default: false },
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
    await initDatabase(config.database.path);

    // Get backups
    let backups: BackupRecord[];
    if (values.schedule) {
      backups = getActiveBackupsBySchedule(values.schedule);
    } else if (values.type && (values.type === "files" || values.type === "volume")) {
      backups = getActiveBackupsByType(values.type);
    } else {
      backups = getAllActiveBackups();
    }

    // Apply limit
    const limit = values.limit ? parseInt(values.limit, 10) : undefined;
    if (limit && limit > 0) {
      backups = backups.slice(0, limit);
    }

    // Output based on format - no intro for scripting formats
    switch (values.format) {
      case "json":
        console.log(JSON.stringify(backups, null, 2));
        return 0;
      case "csv":
        printCsv(backups);
        return 0;
      default:
        // Show intro for table format
        ui.intro("backitup list");

        if (backups.length === 0) {
          ui.info("No backups found");
          ui.outro("Done");
          return 0;
        }

        printTable(backups, values.verbose ?? false);

        ui.outro(`${backups.length} backup(s) total`);
        return 0;
    }
  } catch (error) {
    ui.error(`List failed: ${(error as Error).message}`);
    if (values.verbose) {
      console.error(error);
    }
    return 1;
  }
}

function printTable(backups: BackupRecord[], verbose: boolean): void {
  if (verbose) {
    // Verbose table with backup IDs
    const widths = [36, 7, 10, 19, 12, 6, 16];
    const headers = ["ID", "Type", "Schedule", "Created", "Size", "Files", "Status"];

    ui.step("Backups:");
    console.log(formatTableRow(headers, widths));
    console.log(formatTableSeparator(widths));

    for (const backup of backups) {
      const localStatus = backup.local_path
        ? backup.local_deleted_at
          ? color.red("L:del")
          : color.green("L:ok")
        : "";
      const s3Status = backup.s3_key
        ? backup.s3_deleted_at
          ? color.red("S3:del")
          : color.green("S3:ok")
        : "";
      const status = [localStatus, s3Status].filter(Boolean).join(", ");

      const typeLabel = backup.backup_type === "volume" ? color.cyan("volume") : "files";

      console.log(
        formatTableRow(
          [
            backup.backup_id,
            typeLabel,
            backup.schedule_name,
            backup.created_at.substring(0, 19),
            formatBytes(backup.archive_size_bytes),
            String(backup.files_count),
            status,
          ],
          widths,
        ),
      );
    }
  } else {
    // Compact table with archive names
    const widths = [45, 7, 10, 19, 12];
    const headers = ["Archive", "Type", "Schedule", "Created", "Size"];

    ui.step("Backups:");
    console.log(formatTableRow(headers, widths));
    console.log(formatTableSeparator(widths));

    for (const backup of backups) {
      const typeLabel = backup.backup_type === "volume" ? color.cyan("volume") : "files";

      // For volume backups, show volume name instead of archive name if available
      const displayName =
        backup.backup_type === "volume" && backup.volume_name
          ? `[vol] ${backup.volume_name}`
          : backup.archive_name;

      console.log(
        formatTableRow(
          [
            displayName,
            typeLabel,
            backup.schedule_name,
            backup.created_at.substring(0, 19),
            formatBytes(backup.archive_size_bytes),
          ],
          widths,
        ),
      );
    }
  }

  console.log(formatTableSeparator(verbose ? [36, 7, 10, 19, 12, 6, 16] : [45, 7, 10, 19, 12]));
}

function printCsv(backups: BackupRecord[]): void {
  // Header
  console.log(
    "backup_id,backup_type,schedule_name,archive_name,created_at,size_bytes,files_count,volume_name,local_path,s3_bucket,s3_key,status",
  );

  for (const backup of backups) {
    console.log(
      [
        backup.backup_id,
        backup.backup_type,
        backup.schedule_name,
        backup.archive_name,
        backup.created_at,
        backup.archive_size_bytes,
        backup.files_count,
        backup.volume_name ?? "",
        backup.local_path ?? "",
        backup.s3_bucket ?? "",
        backup.s3_key ?? "",
        backup.status,
      ].join(","),
    );
  }
}

function printHelp(): void {
  console.log(`
${color.bold("backitup list")} - List existing backups

${color.dim("USAGE:")}
  backitup list [OPTIONS]

${color.dim("OPTIONS:")}
  -c, --config <path>     Path to config file (default: ./backitup.config.yaml)
  -s, --schedule <name>   Filter by schedule
  -t, --type <type>       Filter by backup type: files, volume (default: all)
  -n, --limit <number>    Limit number of results
      --format <format>   Output format: table, json, csv (default: table)
  -v, --verbose           Show more details (backup IDs, status)
  -h, --help              Show this help message

${color.dim("EXAMPLES:")}
  backitup list                            # List all backups
  backitup list -s hourly                  # List hourly backups only
  backitup list -t volume                  # List volume backups only
  backitup list -t files                   # List file backups only
  backitup list -n 10                      # List last 10 backups
  backitup list --format json              # Output as JSON (for scripting)
  backitup list --format csv               # Output as CSV (for scripting)
`);
}
