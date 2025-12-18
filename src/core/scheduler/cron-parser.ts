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
  interval: ReturnType<typeof CronExpressionParser.parse>;
}

export function parseCron(expression: string): ParsedCron {
  const interval = CronExpressionParser.parse(expression);
  return { expression, interval };
}

export function matchesCron(cron: ParsedCron, date: Date): boolean {
  // Reset the interval to start from the beginning of the minute
  const testDate = new Date(date);
  testDate.setSeconds(0);
  testDate.setMilliseconds(0);

  // Get the next scheduled time from a minute before
  const checkDate = new Date(testDate.getTime() - 60000);
  const interval = CronExpressionParser.parse(cron.expression, {
    currentDate: checkDate,
  });

  const nextDate = interval.next().toDate();
  nextDate.setSeconds(0);
  nextDate.setMilliseconds(0);

  return nextDate.getTime() === testDate.getTime();
}

export function getNextRun(cron: ParsedCron, fromDate?: Date): Date {
  const interval = CronExpressionParser.parse(cron.expression, {
    currentDate: fromDate,
  });
  return interval.next().toDate();
}

// Re-export for backwards compatibility
export type CronFields = ParsedCron;
