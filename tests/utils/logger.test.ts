import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
  debug,
  error,
  getLogLevel,
  info,
  logger,
  setLogLevel,
  warn,
} from "../../src/utils/logger";

describe("logger", () => {
  let originalLevel: ReturnType<typeof getLogLevel>;
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleWarnSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    originalLevel = getLogLevel();
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleWarnSpy = spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    setLogLevel(originalLevel);
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe("setLogLevel / getLogLevel", () => {
    test("sets and gets log level", () => {
      setLogLevel("debug");
      expect(getLogLevel()).toBe("debug");

      setLogLevel("error");
      expect(getLogLevel()).toBe("error");
    });

    test("supports all log levels", () => {
      const levels = ["debug", "info", "warn", "error"] as const;
      for (const level of levels) {
        setLogLevel(level);
        expect(getLogLevel()).toBe(level);
      }
    });
  });

  describe("log level filtering", () => {
    test("debug logs when level is debug", () => {
      setLogLevel("debug");
      debug("test message");
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    test("debug does not log when level is info", () => {
      setLogLevel("info");
      debug("test message");
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    test("info logs when level is info or lower", () => {
      setLogLevel("info");
      info("test message");
      expect(consoleLogSpy).toHaveBeenCalled();

      consoleLogSpy.mockClear();
      setLogLevel("debug");
      info("test message");
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    test("info does not log when level is warn", () => {
      setLogLevel("warn");
      info("test message");
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    test("warn logs when level is warn or lower", () => {
      setLogLevel("warn");
      warn("test message");
      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockClear();
      setLogLevel("info");
      warn("test message");
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    test("warn does not log when level is error", () => {
      setLogLevel("error");
      warn("test message");
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    test("error always logs", () => {
      setLogLevel("error");
      error("test message");
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockClear();
      setLogLevel("debug");
      error("test message");
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe("message formatting", () => {
    test("includes timestamp in log output", () => {
      setLogLevel("info");
      info("test message");

      const call = consoleLogSpy.mock.calls[0][0] as string;
      // Should contain ISO timestamp format
      expect(call).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    test("includes log level in output", () => {
      setLogLevel("info");
      info("test message");

      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toContain("INFO");
    });

    test("includes message in output", () => {
      setLogLevel("info");
      info("my specific message");

      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toContain("my specific message");
    });

    test("includes additional data in output", () => {
      setLogLevel("info");
      info("test message", { key: "value" });

      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toContain("key");
      expect(call).toContain("value");
    });

    test("formats object data as JSON", () => {
      setLogLevel("info");
      info("test", { nested: { data: true } });

      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toContain('"nested"');
      expect(call).toContain('"data"');
    });

    test("converts non-object data to string", () => {
      setLogLevel("info");
      info("test", 42);

      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toContain("42");
    });
  });

  describe("logger object", () => {
    test("exports all log functions", () => {
      expect(typeof logger.debug).toBe("function");
      expect(typeof logger.info).toBe("function");
      expect(typeof logger.warn).toBe("function");
      expect(typeof logger.error).toBe("function");
    });

    test("exports setLevel and getLevel", () => {
      expect(typeof logger.setLevel).toBe("function");
      expect(typeof logger.getLevel).toBe("function");
    });

    test("logger methods work correctly", () => {
      setLogLevel("debug");

      logger.debug("debug msg");
      expect(consoleLogSpy).toHaveBeenCalled();

      consoleLogSpy.mockClear();
      logger.info("info msg");
      expect(consoleLogSpy).toHaveBeenCalled();

      logger.warn("warn msg");
      expect(consoleWarnSpy).toHaveBeenCalled();

      logger.error("error msg");
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe("color output", () => {
    test("includes ANSI color codes", () => {
      setLogLevel("debug");

      debug("debug message");
      const debugCall = consoleLogSpy.mock.calls[0][0] as string;
      expect(debugCall).toContain("\x1b[");

      consoleLogSpy.mockClear();
      info("info message");
      const infoCall = consoleLogSpy.mock.calls[0][0] as string;
      expect(infoCall).toContain("\x1b[");
    });
  });
});
