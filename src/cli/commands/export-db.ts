import { copyFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { findAndLoadConfig } from "../../config/loader";
import { setLogLevel } from "../../utils/logger";
import { color, ui } from "../ui";

export async function exportDbCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      config: { type: "string", short: "c" },
      verbose: { type: "boolean", short: "v", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  if (values.help) {
    printHelp();
    return 0;
  }

  if (values.verbose) {
    setLogLevel("debug");
  }

  // Get output path from positional argument
  const outputPath = positionals[0];
  if (!outputPath) {
    ui.error("Missing required argument: <output-path>");
    ui.info("Run 'backitup export-db --help' for usage information.");
    return 1;
  }

  try {
    const config = await findAndLoadConfig(values.config);
    const dbPath = config.database.path;

    ui.banner("export-db");

    // Check if database file exists
    const dbFile = Bun.file(dbPath);
    if (!(await dbFile.exists())) {
      ui.error(`Database file not found: ${dbPath}`);
      ui.info("No backups have been created yet, so there's nothing to export.");
      return 1;
    }

    const resolvedOutput = resolve(outputPath);
    const s = ui.spinner();
    s.start("Exporting database...");

    // Ensure output directory exists
    await Bun.write(dirname(resolvedOutput) + "/.keep", "");
    await Bun.file(dirname(resolvedOutput) + "/.keep").delete();

    // Copy the database file
    await copyFile(dbPath, resolvedOutput);

    const stats = await Bun.file(resolvedOutput).size;
    s.stop("Database exported");

    ui.note(
      `Source: ${dbPath}\nOutput: ${resolvedOutput}\nSize: ${formatBytes(stats)}`,
      "Export Summary",
    );

    ui.outro("Database export complete!");
    return 0;
  } catch (error) {
    ui.error(`Export failed: ${(error as Error).message}`);
    if (values.verbose) {
      console.error(error);
    }
    return 1;
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function printHelp(): void {
  console.log(`
${color.bold("backitup export-db")} - Export the database file

${color.dim("USAGE:")}
  backitup export-db <output-path> [OPTIONS]

${color.dim("ARGUMENTS:")}
  <output-path>           Path where the database backup will be saved

${color.dim("OPTIONS:")}
  -c, --config <path>     Path to config file (default: ./backitup.config.yaml)
  -v, --verbose           Verbose output
  -h, --help              Show this help message

${color.dim("DESCRIPTION:")}
  Creates a copy of the BackItUp SQLite database file. This is useful for:
  - Backing up your backup history and metadata
  - Migrating to a new machine
  - Creating snapshots before major changes

${color.dim("EXAMPLES:")}
  backitup export-db ./backitup-db-backup.sqlite
  backitup export-db /backups/db/backitup-$(date +%Y%m%d).sqlite
  backitup export-db ~/backitup-db.sqlite -c /etc/backitup/config.yaml
`);
}
