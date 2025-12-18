/**
 * Styled output helpers
 */

import * as p from "@clack/prompts";
import color from "picocolors";

export { color };

export const intro = (title: string) =>
  p.intro(color.bgCyan(color.black(` ${title} `)));
export const outro = (message: string) => p.outro(color.green(message));
export const cancel = (message: string) => p.cancel(message);
export const note = (message: string, title?: string) => p.note(message, title);

export const info = (message: string) => p.log.info(message);
export const success = (message: string) => p.log.success(message);
export const warn = (message: string) => p.log.warn(message);
export const error = (message: string) => p.log.error(message);
export const step = (message: string) => p.log.step(message);
export const message = (message: string) => p.log.message(message);

export const spinner = p.spinner;
