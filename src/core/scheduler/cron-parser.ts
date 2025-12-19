/**
 * Cron expression parser using cron-parser library
 *
 * Supports: minute hour day-of-month month day-of-week
 *
 * Examples:
 *   "0 * * * *"      - Every hour at minute 0
 *   "0 2 * * *"      - Every day at 2:00 AM
 *   "0 3 * * 0"      - Every Sunday at 3:00 AM
 *   "0,15,30,45 * * * *" - Every 15 minutes
 */

import { CronExpressionParser } from "cron-parser";

export interface ParsedCron {
  expression: string;
  timezone?: string;
  interval: ReturnType<typeof CronExpressionParser.parse>;
}

export interface ParseCronOptions {
  timezone?: string;
}

export function parseCron(expression: string, options?: ParseCronOptions): ParsedCron {
  // Validate that we have exactly 5 fields (standard cron format)
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(
      `Invalid cron expression: "${expression}". Expected 5 fields, got ${fields.length}.`,
    );
  }

  const parserOptions = options?.timezone ? { tz: options.timezone } : undefined;
  const interval = CronExpressionParser.parse(expression, parserOptions);
  return { expression, timezone: options?.timezone, interval };
}

export function matchesCron(cron: ParsedCron, date: Date): boolean {
  // Reset the interval to start from the beginning of the minute
  const testDate = new Date(date);
  testDate.setSeconds(0);
  testDate.setMilliseconds(0);

  // Get the next scheduled time from a minute before
  const checkDate = new Date(testDate.getTime() - 60000);
  const parserOptions: { currentDate: Date; tz?: string } = {
    currentDate: checkDate,
  };
  if (cron.timezone) {
    parserOptions.tz = cron.timezone;
  }
  const interval = CronExpressionParser.parse(cron.expression, parserOptions);

  const nextDate = interval.next().toDate();
  nextDate.setSeconds(0);
  nextDate.setMilliseconds(0);

  return nextDate.getTime() === testDate.getTime();
}

export function getNextRun(cron: ParsedCron, fromDate?: Date): Date {
  const parserOptions: { currentDate?: Date; tz?: string } = {};
  if (fromDate) {
    parserOptions.currentDate = fromDate;
  }
  if (cron.timezone) {
    parserOptions.tz = cron.timezone;
  }
  const interval = CronExpressionParser.parse(
    cron.expression,
    Object.keys(parserOptions).length > 0 ? parserOptions : undefined,
  );
  return interval.next().toDate();
}

// Re-export for backwards compatibility
export type CronFields = ParsedCron;
