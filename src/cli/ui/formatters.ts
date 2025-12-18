/**
 * Table and summary formatters
 */

import color from "picocolors";

export const TABLE_WIDTHS = {
  backupId: 36,
  schedule: 10,
  created: 19,
  size: 12,
  files: 6,
  status: 20,
  archiveName: 50,
} as const;

export interface SummaryItem {
  label: string;
  value: string | number | null | undefined;
}

export function formatSummary(items: SummaryItem[]): string {
  const maxLabelLen = Math.max(...items.map((i) => i.label.length));
  return items
    .filter((i) => i.value !== null && i.value !== undefined)
    .map((i) => `${color.dim(i.label.padEnd(maxLabelLen))}  ${i.value}`)
    .join("\n");
}

export function formatTableRow(columns: string[], widths: number[]): string {
  return columns
    .map((col, i) => col.padEnd(widths[i] ?? 0))
    .join(color.dim(" │ "));
}

export function formatTableSeparator(widths: number[]): string {
  return color.dim(widths.map((w) => "─".repeat(w)).join("─┼─"));
}
