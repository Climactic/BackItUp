import { parseArgs } from "node:util";
import { findAndLoadConfig } from "../../config/loader";
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
`);
}
