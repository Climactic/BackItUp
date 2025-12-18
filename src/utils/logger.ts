export type LogLevel = "debug" | "info" | "warn" | "error";

let currentLevel: LogLevel = "info";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: "\x1b[90m", // gray
  info: "\x1b[36m", // cyan
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
};

const RESET = "\x1b[0m";

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel];
}

function formatMessage(
  level: LogLevel,
  message: string,
  data?: unknown,
): string {
  const timestamp = formatTimestamp();
  const color = LEVEL_COLORS[level];
  const levelStr = level.toUpperCase().padEnd(5);

  let formatted = `${color}[${timestamp}] ${levelStr}${RESET} ${message}`;

  if (data !== undefined) {
    if (typeof data === "object") {
      formatted += ` ${JSON.stringify(data, null, 2)}`;
    } else {
      formatted += ` ${String(data)}`;
    }
  }

  return formatted;
}

export function debug(message: string, data?: unknown): void {
  if (shouldLog("debug")) {
    console.log(formatMessage("debug", message, data));
  }
}

export function info(message: string, data?: unknown): void {
  if (shouldLog("info")) {
    console.log(formatMessage("info", message, data));
  }
}

export function warn(message: string, data?: unknown): void {
  if (shouldLog("warn")) {
    console.warn(formatMessage("warn", message, data));
  }
}

export function error(message: string, data?: unknown): void {
  if (shouldLog("error")) {
    console.error(formatMessage("error", message, data));
  }
}

export const logger = {
  debug,
  info,
  warn,
  error,
  setLevel: setLogLevel,
  getLevel: getLogLevel,
};
