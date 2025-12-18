/**
 * Scheduler daemon
 */

import { getSourcesForSchedule } from "../../config/loader";
import type { BackitupConfig } from "../../types";
import { logger } from "../../utils/logger";
import { runBackup } from "../backup";
import { runCleanup } from "../cleanup";
import { type CronFields, matchesCron, parseCron } from "./cron-parser";

interface ScheduleState {
  name: string;
  cron: CronFields;
  lastRun: Date | null;
  retention: { maxCount: number; maxDays: number };
}

export class Scheduler {
  private config: BackitupConfig;
  private schedules: Map<string, ScheduleState> = new Map();
  private running = false;
  private checkInterval: Timer | null = null;

  constructor(config: BackitupConfig) {
    this.config = config;

    for (const [name, scheduleConfig] of Object.entries(config.schedules)) {
      try {
        const cron = parseCron(scheduleConfig.cron);
        this.schedules.set(name, {
          name,
          cron,
          lastRun: null,
          retention: scheduleConfig.retention,
        });
        logger.debug(`Parsed schedule "${name}": ${scheduleConfig.cron}`);
      } catch (error) {
        logger.error(`Failed to parse schedule "${name}": ${(error as Error).message}`);
      }
    }
  }

  start(): void {
    if (this.running) {
      logger.warn("Scheduler is already running");
      return;
    }

    this.running = true;
    logger.info("Scheduler started");

    this.checkSchedules();

    this.checkInterval = setInterval(() => {
      this.checkSchedules();
    }, 60 * 1000);
  }

  stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    logger.info("Scheduler stopped");
  }

  private async checkSchedules(): Promise<void> {
    const now = new Date();
    now.setSeconds(0);
    now.setMilliseconds(0);

    for (const [name, state] of this.schedules) {
      if (!matchesCron(state.cron, now)) {
        continue;
      }

      if (state.lastRun && state.lastRun.getTime() === now.getTime()) {
        continue;
      }

      logger.info(`Schedule "${name}" triggered`);
      state.lastRun = now;

      try {
        const sources = getSourcesForSchedule(this.config, name);
        const scheduleConfig = this.config.schedules[name];
        const sourceNames = scheduleConfig?.sources ?? Object.keys(this.config.sources);

        const result = await runBackup(this.config, {
          schedule: name,
          sources,
          sourceNames,
        });

        logger.info(
          `Backup completed for schedule "${name}": ${result.archiveName} (${result.filesCount} files)`,
        );

        const cleanupResult = await runCleanup(this.config, {
          schedule: name,
        });

        if (cleanupResult.totalDeleted > 0) {
          logger.info(
            `Cleanup completed for schedule "${name}": ${cleanupResult.totalDeleted} backup(s) deleted`,
          );
        }
      } catch (error) {
        logger.error(`Schedule "${name}" failed: ${(error as Error).message}`);
      }
    }
  }

  getNextRun(scheduleName: string): Date | null {
    const state = this.schedules.get(scheduleName);
    if (!state) {
      return null;
    }

    const now = new Date();
    const maxIterations = 60 * 24 * 366;

    for (let i = 0; i < maxIterations; i++) {
      const checkTime = new Date(now.getTime() + i * 60 * 1000);
      checkTime.setSeconds(0);
      checkTime.setMilliseconds(0);

      if (matchesCron(state.cron, checkTime)) {
        return checkTime;
      }
    }

    return null;
  }

  getStatus(): {
    name: string;
    cron: string;
    lastRun: Date | null;
    nextRun: Date | null;
  }[] {
    const status: {
      name: string;
      cron: string;
      lastRun: Date | null;
      nextRun: Date | null;
    }[] = [];

    for (const [name, state] of this.schedules) {
      const scheduleConfig = this.config.schedules[name];
      if (scheduleConfig) {
        status.push({
          name,
          cron: scheduleConfig.cron,
          lastRun: state.lastRun,
          nextRun: this.getNextRun(name),
        });
      }
    }

    return status;
  }
}
