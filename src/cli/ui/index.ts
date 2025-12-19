/**
 * CLI UI module exports
 */

export type { SummaryItem } from "./formatters";
// Formatters
export { formatSummary, formatTableRow, formatTableSeparator, TABLE_WIDTHS } from "./formatters";
// Output
export {
  banner,
  cancel,
  color,
  error,
  info,
  intro,
  LINKS,
  LOGO,
  message,
  note,
  outro,
  spinner,
  step,
  success,
  VERSION,
  warn,
} from "./output";
// Prompts
export { confirm, isCancel, multiselect, select, text } from "./prompts";

import * as output from "./output";
// Legacy ui object for backward compatibility
import * as prompts from "./prompts";

export const ui = {
  banner: output.banner,
  intro: output.intro,
  outro: output.outro,
  cancel: output.cancel,
  note: output.note,
  info: output.info,
  success: output.success,
  warn: output.warn,
  error: output.error,
  step: output.step,
  message: output.message,
  spinner: output.spinner,
  confirm: prompts.confirm,
  select: prompts.select,
  text: prompts.text,
  multiselect: prompts.multiselect,
  isCancel: prompts.isCancel,
};
