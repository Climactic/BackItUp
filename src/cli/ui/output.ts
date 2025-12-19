/**
 * Styled output helpers
 */

import * as p from "@clack/prompts";
import color from "picocolors";
import pkg from "../../../package.json";

export { color };

export const VERSION = pkg.version;

export const LOGO = String.raw`
 ______     ______     ______     __  __     __     ______   __  __     ______
/\  == \   /\  __ \   /\  ___\   /\ \/ /    /\ \   /\__  _\ /\ \/\ \   /\  == \
\ \  __<   \ \  __ \  \ \ \____  \ \  _"-.  \ \ \  \/_/\ \/ \ \ \_\ \  \ \  _-/
 \ \_____\  \ \_\ \_\  \ \_____\  \ \_\ \_\  \ \_\    \ \_\  \ \_____\  \ \_\
  \/_____/   \/_/\/_/   \/_____/   \/_/\/_/   \/_/     \/_/   \/_____/   \/_/
`;

export const LINKS = `${color.cyan("GitHub:")}    https://github.com/climactic/backitup
${color.cyan("Sponsors:")}  https://github.com/sponsors/Climactic
${color.cyan("Ko-fi:")}     https://ko-fi.com/ClimacticCo`;

/**
 * Display the BackItUp banner with logo, version, and links
 */
export function banner(command: string): void {
  console.log(color.bold(color.cyan(LOGO)));
  p.intro(`${color.cyan("BackItUp")} ${color.dim(`v${VERSION}`)} ${color.dim("·")} ${color.white(command)}`);
  p.note(LINKS, "Links");
}

export const intro = (title: string) => p.intro(color.bgCyan(color.black(` ${title} `)));
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
