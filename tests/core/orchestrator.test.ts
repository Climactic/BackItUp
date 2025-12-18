import { describe, expect, test } from "bun:test";
import { getSourceFolder } from "../../src/core/backup/orchestrator";
import type { SourceConfig } from "../../src/types";

describe("orchestrator", () => {
  describe("getSourceFolder", () => {
    test("uses s3Prefix when single source has it set", () => {
      const sources: SourceConfig[] = [{ path: "/app", s3Prefix: "my-custom-folder" }];
      const sourceNames = ["app"];

      const folder = getSourceFolder(sources, sourceNames);

      expect(folder).toBe("my-custom-folder");
    });

    test("uses source name when single source has no s3Prefix", () => {
      const sources: SourceConfig[] = [{ path: "/app" }];
      const sourceNames = ["app"];

      const folder = getSourceFolder(sources, sourceNames);

      expect(folder).toBe("app");
    });

    test("joins source names when multiple sources", () => {
      const sources: SourceConfig[] = [{ path: "/app" }, { path: "/db" }];
      const sourceNames = ["app", "db"];

      const folder = getSourceFolder(sources, sourceNames);

      expect(folder).toBe("app-db");
    });

    test("joins source names even when first source has s3Prefix (multi-source)", () => {
      const sources: SourceConfig[] = [{ path: "/app", s3Prefix: "custom" }, { path: "/db" }];
      const sourceNames = ["app", "db"];

      const folder = getSourceFolder(sources, sourceNames);

      // Multi-source always uses joined names, ignoring s3Prefix
      expect(folder).toBe("app-db");
    });

    test("handles three or more sources", () => {
      const sources: SourceConfig[] = [{ path: "/app" }, { path: "/db" }, { path: "/cache" }];
      const sourceNames = ["app", "db", "cache"];

      const folder = getSourceFolder(sources, sourceNames);

      expect(folder).toBe("app-db-cache");
    });

    test("handles empty source names array (edge case)", () => {
      const sources: SourceConfig[] = [];
      const sourceNames: string[] = [];

      const folder = getSourceFolder(sources, sourceNames);

      expect(folder).toBe("");
    });

    test("uses s3Prefix with special characters", () => {
      const sources: SourceConfig[] = [{ path: "/app", s3Prefix: "prod/backups/app-data" }];
      const sourceNames = ["app"];

      const folder = getSourceFolder(sources, sourceNames);

      expect(folder).toBe("prod/backups/app-data");
    });
  });
});
