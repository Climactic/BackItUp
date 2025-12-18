#!/usr/bin/env bun

import * as p from "@clack/prompts";
import color from "picocolors";
import pkg from "../package.json";
import { backupCommand } from "./cli/commands/backup";
import { cleanupCommand } from "./cli/commands/cleanup";
import { listCommand } from "./cli/commands/list";
import { startCommand } from "./cli/commands/start";
import { verifyCommand } from "./cli/commands/verify";

const VERSION = pkg.version;

const LOGO = String.raw`
 ______     ______     ______     __  __     __     ______   __  __     ______
/\  == \   /\  __ \   /\  ___\   /\ \/ /    /\ \   /\__  _\ /\ \/\ \   /\  == \
\ \  __<   \ \  __ \  \ \ \____  \ \  _"-.  \ \ \  \/_/\ \/ \ \ \_\ \  \ \  _-/
 \ \_____\  \ \_\ \_\  \ \_____\  \ \_\ \_\  \ \_\    \ \_\  \ \_____\  \ \_\
  \/_____/   \/_/\/_/   \/_____/   \/_/\/_/   \/_/     \/_/   \/_____/   \/_/
`;

function printHelp(): void {
  console.log(color.bold(color.cyan(LOGO)));
  p.intro(`${color.cyan("BackItUp")} ${color.dim(`v${VERSION}`)} - Secure backup utility`);

  p.note(
    `${color.cyan("start")}       Start the scheduler daemon
${color.cyan("backup")}      Create a backup
${color.cyan("cleanup")}     Clean up old backups based on retention policy
${color.cyan("list")}        List existing backups
${color.cyan("verify")}      Verify backup integrity`,
    "Commands",
  );

  p.note(
    `-h, --help      Show this help message
-v, --version   Show version`,
    "Options",
  );

  p.note(
    `backitup start                    ${color.dim("# Start scheduler daemon")}
backitup backup -s hourly         ${color.dim("# Create hourly backup")}
backitup backup                   ${color.dim("# Interactive schedule selection")}
backitup cleanup --dry-run        ${color.dim("# Preview cleanup")}
backitup list                     ${color.dim("# List all backups")}
backitup verify --all             ${color.dim("# Verify all backups")}`,
    "Examples",
  );

  p.note(
    `${color.cyan("GitHub:")}    https://github.com/climactic/backitup
${color.cyan("Sponsors:")}  https://github.com/sponsors/Climactic
${color.cyan("Ko-fi:")}     https://ko-fi.com/ClimacticCo`,
    "Links",
  );

  p.outro(`Run ${color.cyan("backitup <command> --help")} for command details`);
}

function printVersion(): void {
  console.log(color.bold(color.cyan(LOGO)));
  p.intro(`${color.cyan("BackItUp")} ${color.dim(`v${VERSION}`)}`);

  p.note(
    `${color.cyan("GitHub:")}    https://github.com/climactic/backitup
${color.cyan("Sponsors:")}  https://github.com/sponsors/Climactic
${color.cyan("Ko-fi:")}     https://ko-fi.com/ClimacticCo`,
    "Links",
  );

  p.outro(`Run ${color.cyan("backitup --help")} for usage`);
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printHelp();
    return 0;
  }

  const command = args[0];
  const commandArgs = args.slice(1);

  switch (command) {
    case "start":
      return startCommand(commandArgs);

    case "backup":
      return backupCommand(commandArgs);

    case "cleanup":
      return cleanupCommand(commandArgs);

    case "list":
      return listCommand(commandArgs);

    case "verify":
      return verifyCommand(commandArgs);

    case "-h":
    case "--help":
    case "help":
      printHelp();
      return 0;

    case "-v":
    case "--version":
    case "version":
      printVersion();
      return 0;

    default:
      console.error(`${color.red("Error:")} Unknown command: ${command}`);
      console.error(`Run ${color.cyan("backitup --help")} for usage information.`);
      return 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`${color.red("Fatal error:")}`, error);
    process.exit(1);
  });
