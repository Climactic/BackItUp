import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import * as os from "node:os";
import * as path from "node:path";
import { $ } from "bun";

describe("CLI commands", () => {
  let tempDir: string;
  let configPath: string;
  let sourceDir: string;
  let backupDir: string;
  let cliPath: string;

  beforeAll(async () => {
    tempDir = path.join(os.tmpdir(), `backitup-cli-test-${Date.now()}`);
    sourceDir = path.join(tempDir, "source");
    backupDir = path.join(tempDir, "backups");
    configPath = path.join(tempDir, "backitup.config.yaml");
    cliPath = path.resolve("src/index.ts");

    // Create directories
    await $`mkdir -p ${sourceDir} ${backupDir}`;

    // Create test source files
    await Bun.write(path.join(sourceDir, "file1.txt"), "content 1");
    await Bun.write(path.join(sourceDir, "file2.txt"), "content 2");

    // Create config file
    await Bun.write(
      configPath,
      `
version: "1.0"
database:
  path: ${path.join(tempDir, "backitup.db")}
sources:
  app:
    path: ${sourceDir}
    patterns:
      - "**/*.txt"
local:
  enabled: true
  path: ${backupDir}
s3:
  enabled: false
schedules:
  hourly:
    cron: "0 * * * *"
    retention:
      maxCount: 24
      maxDays: 2
  daily:
    cron: "0 2 * * *"
    retention:
      maxCount: 7
      maxDays: 30
`,
    );
  });

  afterAll(async () => {
    await $`rm -rf ${tempDir}`.quiet();
  });

  describe("--help flag", () => {
    test("shows main help", async () => {
      const result = await $`bun ${cliPath} --help`.text();

      expect(result).toContain("BackItUp");
      expect(result).toContain("Commands");
      expect(result).toContain("start");
      expect(result).toContain("backup");
      expect(result).toContain("cleanup");
      expect(result).toContain("list");
      expect(result).toContain("verify");
    });

    test("shows backup help", async () => {
      const result = await $`bun ${cliPath} backup --help`.text();

      expect(result).toContain("backitup backup");
      expect(result).toContain("--schedule");
      expect(result).toContain("--dry-run");
      expect(result).toContain("--local-only");
    });

    test("shows cleanup help", async () => {
      const result = await $`bun ${cliPath} cleanup --help`.text();

      expect(result).toContain("backitup cleanup");
      expect(result).toContain("--force");
      expect(result).toContain("--dry-run");
      expect(result).toContain("SECURITY:");
    });

    test("shows list help", async () => {
      const result = await $`bun ${cliPath} list --help`.text();

      expect(result).toContain("backitup list");
      expect(result).toContain("--format");
      expect(result).toContain("--limit");
    });

    test("shows verify help", async () => {
      const result = await $`bun ${cliPath} verify --help`.text();

      expect(result).toContain("backitup verify");
      expect(result).toContain("--all");
      expect(result).toContain("--fix");
    });

    test("shows start help", async () => {
      const result = await $`bun ${cliPath} start --help`.text();

      expect(result).toContain("backitup start");
      expect(result).toContain("scheduler daemon");
      expect(result).toContain("SCHEDULE FORMAT:");
    });
  });

  describe("--version flag", () => {
    test("shows version", async () => {
      const result = await $`bun ${cliPath} --version`.text();

      expect(result).toContain("BackItUp");
      expect(result).toMatch(/v\d+\.\d+\.\d+/);
    });
  });

  describe("unknown command", () => {
    test("shows error for unknown command", async () => {
      const proc = Bun.spawn(["bun", cliPath, "unknown"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      expect(exitCode).toBe(1);
      expect(stdout + stderr).toContain("Unknown command");
    });
  });

  describe("backup command", () => {
    test("runs backup with schedule flag", async () => {
      const proc = Bun.spawn(
        ["bun", cliPath, "backup", "-c", configPath, "-s", "manual"],
        {
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      expect(exitCode).toBe(0);
      expect(stdout).toContain("backitup backup");
      expect(stdout).toContain("Backup complete");
    });

    test("runs backup with dry-run", async () => {
      const proc = Bun.spawn(
        [
          "bun",
          cliPath,
          "backup",
          "-c",
          configPath,
          "-s",
          "manual",
          "--dry-run",
        ],
        {
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      expect(exitCode).toBe(0);
      expect(stdout).toContain("DRY RUN");
    });

    test("creates archive file on backup", async () => {
      // Clear backup directory - use Bun.Glob to find files first
      const existingFiles = await Array.fromAsync(
        new Bun.Glob("*.tar.gz").scan({ cwd: backupDir }),
      );
      for (const f of existingFiles) {
        await $`rm -f ${path.join(backupDir, f)}`.quiet();
      }

      const proc = Bun.spawn(
        ["bun", cliPath, "backup", "-c", configPath, "-s", "manual"],
        {
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      await proc.exited;

      // Check that a backup file was created
      const files = await Array.fromAsync(
        new Bun.Glob("*.tar.gz").scan({ cwd: backupDir }),
      );
      expect(files.length).toBeGreaterThan(0);
    });

    test("rejects unknown schedule", async () => {
      const proc = Bun.spawn(
        ["bun", cliPath, "backup", "-c", configPath, "-s", "nonexistent"],
        {
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      expect(exitCode).toBe(1);
      expect(stdout).toContain("Unknown schedule");
    });
  });

  describe("list command", () => {
    beforeEach(async () => {
      // Ensure at least one backup exists
      const proc = Bun.spawn(
        ["bun", cliPath, "backup", "-c", configPath, "-s", "manual"],
        {
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      await proc.exited;
    });

    test("lists backups in table format", async () => {
      const proc = Bun.spawn(["bun", cliPath, "list", "-c", configPath], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      expect(exitCode).toBe(0);
      expect(stdout).toContain("backitup list");
    });

    test("lists backups in JSON format", async () => {
      const proc = Bun.spawn(
        ["bun", cliPath, "list", "-c", configPath, "--format", "json"],
        {
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      expect(exitCode).toBe(0);
      // Should be valid JSON
      const parsed = JSON.parse(stdout);
      expect(Array.isArray(parsed)).toBe(true);
      if (parsed.length > 0) {
        expect(parsed[0]).toHaveProperty("backup_id");
        expect(parsed[0]).toHaveProperty("archive_name");
      }
    });

    test("lists backups in CSV format", async () => {
      const proc = Bun.spawn(
        ["bun", cliPath, "list", "-c", configPath, "--format", "csv"],
        {
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      expect(exitCode).toBe(0);
      // Should have header row (includes backup_type and volume_name from Docker volume support)
      expect(stdout).toContain(
        "backup_id,backup_type,schedule_name,archive_name",
      );
    });

    test("limits results with -n flag", async () => {
      const proc = Bun.spawn(
        [
          "bun",
          cliPath,
          "list",
          "-c",
          configPath,
          "--format",
          "json",
          "-n",
          "1",
        ],
        {
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.length).toBeLessThanOrEqual(1);
    });
  });

  describe("verify command", () => {
    beforeEach(async () => {
      // Ensure at least one backup exists
      const proc = Bun.spawn(
        ["bun", cliPath, "backup", "-c", configPath, "-s", "manual"],
        {
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      await proc.exited;
    });

    test("verifies all backups", async () => {
      const proc = Bun.spawn(
        ["bun", cliPath, "verify", "-c", configPath, "--all"],
        {
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const stdout = await new Response(proc.stdout).text();
      await proc.exited;

      expect(stdout).toContain("backitup verify");
      expect(stdout).toContain("Verification");
    });

    test("requires --all or backup ID", async () => {
      const proc = Bun.spawn(["bun", cliPath, "verify", "-c", configPath], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      expect(exitCode).toBe(1);
      expect(stdout).toContain("Specify backup IDs or use --all");
    });
  });

  describe("cleanup command", () => {
    test("runs cleanup with dry-run", async () => {
      const proc = Bun.spawn(
        ["bun", cliPath, "cleanup", "-c", configPath, "--dry-run"],
        {
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      expect(exitCode).toBe(0);
      expect(stdout).toContain("backitup cleanup");
    });

    test("runs cleanup with force flag", async () => {
      const proc = Bun.spawn(
        ["bun", cliPath, "cleanup", "-c", configPath, "--force"],
        {
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      expect(exitCode).toBe(0);
      expect(stdout).toContain("backitup cleanup");
    });
  });

  describe("config validation", () => {
    test("errors on missing config", async () => {
      const proc = Bun.spawn(
        [
          "bun",
          cliPath,
          "backup",
          "-c",
          "/nonexistent/config.yaml",
          "-s",
          "manual",
        ],
        {
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      expect(exitCode).toBe(1);
      expect(stdout).toContain("not found");
    });

    test("errors on invalid config", async () => {
      const invalidConfigPath = path.join(tempDir, "invalid.yaml");
      await Bun.write(invalidConfigPath, "invalid: yaml: [[[");

      const proc = Bun.spawn(
        ["bun", cliPath, "backup", "-c", invalidConfigPath, "-s", "manual"],
        {
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const _stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      expect(exitCode).toBe(1);
    });
  });
});

describe("CLI argument parsing", () => {
  const cliPath = path.resolve("src/index.ts");

  test("handles short flags", async () => {
    const result = await $`bun ${cliPath} -h`.text();
    expect(result).toContain("Commands");
  });

  test("handles long flags", async () => {
    const result = await $`bun ${cliPath} --help`.text();
    expect(result).toContain("Commands");
  });

  test("handles combined short flags", async () => {
    const result = await $`bun ${cliPath} backup -h`.text();
    expect(result).toContain("backitup backup");
  });
});
