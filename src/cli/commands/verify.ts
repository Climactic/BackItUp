import { parseArgs } from "node:util";
import { findAndLoadConfig } from "../../config/loader";
import { getAllActiveBackups, getBackupById, initDatabase, markBackupDeleted } from "../../db";
import { getLocalFileChecksum, localFileExists } from "../../storage/local";
import { initS3Client, s3ObjectExists } from "../../storage/s3";
import type { BackupRecord } from "../../types";
import { setLogLevel } from "../../utils/logger";
import { color, formatSummary, ui } from "../ui";

interface VerifyResult {
  backupId: string;
  archiveName: string;
  localOk: boolean | null; // null = not applicable
  s3Ok: boolean | null;
  checksumOk: boolean | null;
  issues: string[];
}

export async function verifyCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      config: { type: "string", short: "c" },
      all: { type: "boolean", default: false },
      fix: { type: "boolean", default: false },
      force: { type: "boolean", default: false },
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

  try {
    const config = await findAndLoadConfig(values.config);
    initDatabase(config.database.path);

    ui.intro("backitup verify");

    // Initialize S3 if enabled
    if (config.s3.enabled) {
      initS3Client(config.s3);
    }

    // Get backups to verify
    let backups: BackupRecord[];

    if (positionals.length > 0) {
      // Verify specific backup(s)
      backups = [];
      for (const id of positionals) {
        const backup = getBackupById(id);
        if (backup) {
          backups.push(backup);
        } else {
          ui.warn(`Backup not found: ${id}`);
        }
      }
    } else if (values.all) {
      backups = getAllActiveBackups();
    } else {
      ui.error("Specify backup IDs or use --all to verify all backups");
      return 1;
    }

    if (backups.length === 0) {
      ui.success("No backups to verify");
      ui.outro("Done");
      return 0;
    }

    // Run verification with spinner
    const s = ui.spinner();
    s.start(`Verifying ${backups.length} backup(s)...`);

    const results: VerifyResult[] = [];
    let totalIssues = 0;
    let backupsWithIssues = 0;

    for (const backup of backups) {
      const result = await verifyBackup(backup, config.s3.enabled);
      results.push(result);

      if (result.issues.length > 0) {
        totalIssues += result.issues.length;
        backupsWithIssues++;
      }
    }

    s.stop("Verification complete");

    // Display results
    for (const result of results) {
      if (result.issues.length === 0) {
        ui.success(`${result.archiveName}`);
      } else {
        ui.error(`${result.archiveName}`);
        for (const issue of result.issues) {
          ui.message(`  ${color.dim("•")} ${issue}`);
        }
      }
    }

    // Summary
    const summaryItems = [
      { label: "Verified", value: backups.length.toString() },
      {
        label: "Healthy",
        value: (backups.length - backupsWithIssues).toString(),
      },
      { label: "With issues", value: backupsWithIssues.toString() },
      { label: "Total issues", value: totalIssues.toString() },
    ];

    ui.note(formatSummary(summaryItems), "Verification Summary");

    // Handle --fix
    if (values.fix && backupsWithIssues > 0) {
      // Confirm unless --force
      if (!values.force) {
        const confirmed = await ui.confirm({
          message: `Update database for ${backupsWithIssues} backup(s) with missing files?`,
          initialValue: false,
        });

        if (ui.isCancel(confirmed) || !confirmed) {
          ui.cancel("Fix cancelled");
          ui.info("Run with --fix --force to skip confirmation");
          return 1;
        }
      }

      const fixSpinner = ui.spinner();
      fixSpinner.start("Updating database...");

      let fixed = 0;
      for (const result of results) {
        if (result.issues.length === 0) continue;

        const allMissing =
          (result.localOk === false || result.localOk === null) &&
          (result.s3Ok === false || result.s3Ok === null);

        if (allMissing) {
          markBackupDeleted(result.backupId, "both");
          fixed++;
        }
      }

      fixSpinner.stop(`Updated ${fixed} backup record(s)`);
      ui.success("Database has been updated to reflect missing files");
    } else if (totalIssues > 0 && !values.fix) {
      ui.info("Run with --fix to update database for missing files");
    }

    if (totalIssues > 0) {
      ui.outro("Verification found issues");
      return 1;
    }

    ui.outro("All backups verified!");
    return 0;
  } catch (error) {
    ui.error(`Verify failed: ${(error as Error).message}`);
    if (values.verbose) {
      console.error(error);
    }
    return 1;
  }
}

async function verifyBackup(backup: BackupRecord, s3Enabled: boolean): Promise<VerifyResult> {
  const issues: string[] = [];
  let localOk: boolean | null = null;
  let s3Ok: boolean | null = null;
  let checksumOk: boolean | null = null;

  // Check local file
  if (backup.local_path && !backup.local_deleted_at) {
    const exists = await localFileExists(backup.local_path);
    localOk = exists;

    if (!exists) {
      issues.push(`Local file missing: ${backup.local_path}`);
    } else {
      // Verify checksum
      const actualChecksum = await getLocalFileChecksum(backup.local_path);
      checksumOk = actualChecksum === backup.archive_checksum;

      if (!checksumOk) {
        issues.push(
          `Checksum mismatch: expected ${backup.archive_checksum}, got ${actualChecksum}`,
        );
      }
    }
  }

  // Check S3 object
  if (s3Enabled && backup.s3_key && !backup.s3_deleted_at) {
    try {
      const exists = await s3ObjectExists(backup.s3_key);
      s3Ok = exists;

      if (!exists) {
        issues.push(`S3 object missing: s3://${backup.s3_bucket}/${backup.s3_key}`);
      }
    } catch (error) {
      s3Ok = false;
      issues.push(`S3 check failed: ${(error as Error).message}`);
    }
  }

  return {
    backupId: backup.backup_id,
    archiveName: backup.archive_name,
    localOk,
    s3Ok,
    checksumOk,
    issues,
  };
}

function printHelp(): void {
  console.log(`
${color.bold("backitup verify")} - Verify backup integrity

${color.dim("USAGE:")}
  backitup verify [BACKUP_ID...] [OPTIONS]
  backitup verify --all [OPTIONS]

${color.dim("OPTIONS:")}
  -c, --config <path>     Path to config file (default: ./backitup.config.yaml)
      --all               Verify all active backups
      --fix               Update database for missing files (with confirmation)
      --force             Skip confirmation when using --fix
  -v, --verbose           Verbose output
  -h, --help              Show this help message

${color.dim("DESCRIPTION:")}
  Verifies that backup files exist and their checksums match the database.

  Checks performed:
    1. Local file exists (if configured)
    2. S3 object exists (if configured)
    3. Checksum matches (for local files)

  Use --fix to mark backups with missing files as deleted in the database.
  Add --force to skip the confirmation prompt.

${color.dim("EXAMPLES:")}
  backitup verify abc123                   # Verify specific backup
  backitup verify --all                    # Verify all backups
  backitup verify --all --fix              # Verify and fix database (with confirmation)
  backitup verify --all --fix --force      # Verify and fix without confirmation
`);
}
