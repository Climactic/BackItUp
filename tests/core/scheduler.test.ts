import { describe, expect, test } from "bun:test";
import { Scheduler } from "../../src/core";
import type { BackitupConfig } from "../../src/types";

// Helper to create test config
function createTestConfig(
  schedules: Record<
    string,
    { cron: string; retention?: { maxCount: number; maxDays: number } }
  >,
): BackitupConfig {
  return {
    version: "1.0",
    database: { path: ":memory:" },
    sources: {
      test: { path: "/tmp/test" },
    },
    local: { enabled: true, path: "/tmp/backups" },
    s3: { enabled: false, bucket: "", region: "" },
    schedules: Object.fromEntries(
      Object.entries(schedules).map(([name, s]) => [
        name,
        {
          cron: s.cron,
          retention: s.retention ?? { maxCount: 10, maxDays: 30 },
        },
      ]),
    ),
  };
}

describe("Scheduler", () => {
  describe("constructor", () => {
    test("parses valid cron expressions", () => {
      const config = createTestConfig({
        hourly: { cron: "0 * * * *" },
        daily: { cron: "0 2 * * *" },
        weekly: { cron: "0 3 * * 0" },
      });

      const scheduler = new Scheduler(config);
      const status = scheduler.getStatus();

      expect(status).toHaveLength(3);
      expect(status.map((s) => s.name)).toContain("hourly");
      expect(status.map((s) => s.name)).toContain("daily");
      expect(status.map((s) => s.name)).toContain("weekly");
    });

    test("handles invalid cron expressions gracefully", () => {
      const config = createTestConfig({
        valid: { cron: "0 * * * *" },
        invalid: { cron: "invalid cron" },
      });

      // Should not throw, just log error
      const scheduler = new Scheduler(config);
      const status = scheduler.getStatus();

      // Only valid schedule should be parsed
      expect(status).toHaveLength(1);
      expect(status[0]!.name).toBe("valid");
    });
  });

  describe("getNextRun", () => {
    test("returns next run time for hourly schedule", () => {
      const config = createTestConfig({
        hourly: { cron: "0 * * * *" }, // Every hour at minute 0
      });
      const scheduler = new Scheduler(config);

      const nextRun = scheduler.getNextRun("hourly");

      expect(nextRun).not.toBeNull();
      expect(nextRun?.getMinutes()).toBe(0);
      expect(nextRun?.getTime()).toBeGreaterThan(Date.now());
    });

    test("returns next run time for daily schedule", () => {
      const config = createTestConfig({
        daily: { cron: "0 2 * * *" }, // Every day at 2:00 AM
      });
      const scheduler = new Scheduler(config);

      const nextRun = scheduler.getNextRun("daily");

      expect(nextRun).not.toBeNull();
      expect(nextRun?.getHours()).toBe(2);
      expect(nextRun?.getMinutes()).toBe(0);
    });

    test("returns next run time for weekly schedule", () => {
      const config = createTestConfig({
        weekly: { cron: "0 3 * * 0" }, // Every Sunday at 3:00 AM
      });
      const scheduler = new Scheduler(config);

      const nextRun = scheduler.getNextRun("weekly");

      expect(nextRun).not.toBeNull();
      expect(nextRun?.getDay()).toBe(0); // Sunday
      expect(nextRun?.getHours()).toBe(3);
    });

    test("returns null for unknown schedule", () => {
      const config = createTestConfig({
        daily: { cron: "0 2 * * *" },
      });
      const scheduler = new Scheduler(config);

      const nextRun = scheduler.getNextRun("nonexistent");

      expect(nextRun).toBeNull();
    });

    test("handles step values in cron", () => {
      const config = createTestConfig({
        every15: { cron: "*/15 * * * *" }, // Every 15 minutes
      });
      const scheduler = new Scheduler(config);

      const nextRun = scheduler.getNextRun("every15");

      expect(nextRun).not.toBeNull();
      expect([0, 15, 30, 45]).toContain(nextRun!.getMinutes());
    });

    test("handles range values in cron", () => {
      const config = createTestConfig({
        workHours: { cron: "0 9-17 * * *" }, // Every hour from 9 AM to 5 PM
      });
      const scheduler = new Scheduler(config);

      const nextRun = scheduler.getNextRun("workHours");

      expect(nextRun).not.toBeNull();
      const hour = nextRun?.getHours();
      expect(hour).toBeGreaterThanOrEqual(9);
      expect(hour).toBeLessThanOrEqual(17);
    });

    test("handles comma-separated values in cron", () => {
      const config = createTestConfig({
        specific: { cron: "0 6,12,18 * * *" }, // At 6 AM, 12 PM, and 6 PM
      });
      const scheduler = new Scheduler(config);

      const nextRun = scheduler.getNextRun("specific");

      expect(nextRun).not.toBeNull();
      expect([6, 12, 18]).toContain(nextRun!.getHours());
    });
  });

  describe("getStatus", () => {
    test("returns status for all schedules", () => {
      const config = createTestConfig({
        hourly: { cron: "0 * * * *" },
        daily: { cron: "0 2 * * *" },
      });
      const scheduler = new Scheduler(config);

      const status = scheduler.getStatus();

      expect(status).toHaveLength(2);

      for (const s of status) {
        expect(s.name).toBeTruthy();
        expect(s.cron).toBeTruthy();
        expect(s.lastRun).toBeNull(); // No runs yet
        expect(s.nextRun).not.toBeNull();
      }
    });

    test("includes cron expression in status", () => {
      const config = createTestConfig({
        test: { cron: "30 4 * * *" },
      });
      const scheduler = new Scheduler(config);

      const status = scheduler.getStatus();

      expect(status[0]!.cron).toBe("30 4 * * *");
    });
  });

  describe("start/stop", () => {
    test("starts and stops without error", () => {
      const config = createTestConfig({
        hourly: { cron: "0 * * * *" },
      });
      const scheduler = new Scheduler(config);

      expect(() => scheduler.start()).not.toThrow();
      expect(() => scheduler.stop()).not.toThrow();
    });

    test("handles multiple start calls", () => {
      const config = createTestConfig({
        hourly: { cron: "0 * * * *" },
      });
      const scheduler = new Scheduler(config);

      scheduler.start();
      expect(() => scheduler.start()).not.toThrow(); // Should warn but not throw
      scheduler.stop();
    });

    test("handles stop when not running", () => {
      const config = createTestConfig({
        hourly: { cron: "0 * * * *" },
      });
      const scheduler = new Scheduler(config);

      expect(() => scheduler.stop()).not.toThrow(); // Should be no-op
    });
  });
});

describe("Cron expression parsing", () => {
  // Test cron parsing through scheduler behavior

  describe("minute field", () => {
    test("parses single value", () => {
      const config = createTestConfig({ test: { cron: "30 * * * *" } });
      const scheduler = new Scheduler(config);
      const nextRun = scheduler.getNextRun("test");
      expect(nextRun?.getMinutes()).toBe(30);
    });

    test("parses wildcard", () => {
      const config = createTestConfig({ test: { cron: "* * * * *" } });
      const scheduler = new Scheduler(config);
      const nextRun = scheduler.getNextRun("test");
      // Should be within the next minute
      expect(nextRun).not.toBeNull();
    });

    test("parses step value", () => {
      const config = createTestConfig({ test: { cron: "*/10 * * * *" } });
      const scheduler = new Scheduler(config);
      const nextRun = scheduler.getNextRun("test");
      expect([0, 10, 20, 30, 40, 50]).toContain(nextRun!.getMinutes());
    });

    test("parses range", () => {
      const config = createTestConfig({ test: { cron: "10-20 * * * *" } });
      const scheduler = new Scheduler(config);
      const nextRun = scheduler.getNextRun("test");
      const min = nextRun?.getMinutes() ?? -1;
      expect(min).toBeGreaterThanOrEqual(10);
      expect(min).toBeLessThanOrEqual(20);
    });

    test("parses comma-separated values", () => {
      const config = createTestConfig({ test: { cron: "0,30 * * * *" } });
      const scheduler = new Scheduler(config);
      const nextRun = scheduler.getNextRun("test");
      expect([0, 30]).toContain(nextRun!.getMinutes());
    });
  });

  describe("hour field", () => {
    test("parses single value", () => {
      const config = createTestConfig({ test: { cron: "0 14 * * *" } });
      const scheduler = new Scheduler(config);
      const nextRun = scheduler.getNextRun("test");
      expect(nextRun?.getHours()).toBe(14);
    });

    test("parses range", () => {
      const config = createTestConfig({ test: { cron: "0 9-17 * * *" } });
      const scheduler = new Scheduler(config);
      const nextRun = scheduler.getNextRun("test");
      const hour = nextRun?.getHours() ?? -1;
      expect(hour).toBeGreaterThanOrEqual(9);
      expect(hour).toBeLessThanOrEqual(17);
    });
  });

  describe("day of week field", () => {
    test("parses Sunday (0)", () => {
      const config = createTestConfig({ test: { cron: "0 0 * * 0" } });
      const scheduler = new Scheduler(config);
      const nextRun = scheduler.getNextRun("test");
      expect(nextRun?.getDay()).toBe(0);
    });

    test("parses Saturday (6)", () => {
      const config = createTestConfig({ test: { cron: "0 0 * * 6" } });
      const scheduler = new Scheduler(config);
      const nextRun = scheduler.getNextRun("test");
      expect(nextRun?.getDay()).toBe(6);
    });

    test("parses weekdays (1-5)", () => {
      const config = createTestConfig({ test: { cron: "0 0 * * 1-5" } });
      const scheduler = new Scheduler(config);
      const nextRun = scheduler.getNextRun("test");
      const day = nextRun?.getDay() ?? -1;
      expect(day).toBeGreaterThanOrEqual(1);
      expect(day).toBeLessThanOrEqual(5);
    });
  });

  describe("complex expressions", () => {
    test("parses business hours cron", () => {
      // Every 15 minutes during business hours on weekdays
      const config = createTestConfig({ test: { cron: "*/15 9-17 * * 1-5" } });
      const scheduler = new Scheduler(config);
      const nextRun = scheduler.getNextRun("test");

      expect(nextRun).not.toBeNull();
      expect([0, 15, 30, 45]).toContain(nextRun!.getMinutes());
      const hour = nextRun?.getHours() ?? -1;
      expect(hour).toBeGreaterThanOrEqual(9);
      expect(hour).toBeLessThanOrEqual(17);
      const day = nextRun?.getDay() ?? -1;
      expect(day).toBeGreaterThanOrEqual(1);
      expect(day).toBeLessThanOrEqual(5);
    });

    test("parses monthly first-of-month cron", () => {
      const config = createTestConfig({ test: { cron: "0 0 1 * *" } });
      const scheduler = new Scheduler(config);
      const nextRun = scheduler.getNextRun("test");

      expect(nextRun?.getDate()).toBe(1);
      expect(nextRun?.getHours()).toBe(0);
      expect(nextRun?.getMinutes()).toBe(0);
    });
  });

  describe("invalid expressions", () => {
    test("rejects expressions with wrong number of fields", () => {
      const config = createTestConfig({ test: { cron: "0 * * *" } }); // 4 fields
      const scheduler = new Scheduler(config);
      const status = scheduler.getStatus();
      expect(status).toHaveLength(0); // Should not be added
    });

    test("rejects expressions with too many fields", () => {
      const config = createTestConfig({ test: { cron: "0 * * * * *" } }); // 6 fields
      const scheduler = new Scheduler(config);
      const status = scheduler.getStatus();
      expect(status).toHaveLength(0);
    });
  });
});
