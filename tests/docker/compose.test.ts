import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as os from "node:os";
import * as path from "node:path";
import { $ } from "bun";
import {
  type ComposeFile,
  getComposeVolumes,
  getServiceNamedVolumes,
  getServiceVolumes,
  inferProjectName,
  parseComposeFile,
} from "../../src/docker/compose";

function assertComposeFile(file: ComposeFile | null): ComposeFile {
  if (!file) throw new Error("Expected compose file to be parsed");
  return file;
}

describe("docker compose", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = path.join(os.tmpdir(), `backitup-compose-test-${Date.now()}`);
    await $`mkdir -p ${tempDir}`;
  });

  afterAll(async () => {
    await $`rm -rf ${tempDir}`.quiet();
  });

  describe("parseComposeFile", () => {
    test("parses valid compose file", async () => {
      const composePath = path.join(tempDir, "docker-compose.yml");
      await Bun.write(
        composePath,
        `
version: "3.8"
services:
  web:
    image: nginx
    volumes:
      - web_data:/var/www
  db:
    image: postgres
    volumes:
      - db_data:/var/lib/postgresql/data
volumes:
  web_data:
  db_data:
`,
      );

      const result = await parseComposeFile(composePath);

      expect(result).not.toBeNull();
      expect(result?.services).toBeDefined();
      expect(result?.services.web).toBeDefined();
      expect(result?.services.db).toBeDefined();
      expect(result?.volumes).toBeDefined();
    });

    test("returns null for non-existent file", async () => {
      const result = await parseComposeFile(
        path.join(tempDir, "nonexistent.yml"),
      );
      expect(result).toBeNull();
    });

    test("returns null for invalid YAML", async () => {
      const composePath = path.join(tempDir, "invalid.yml");
      await Bun.write(composePath, "invalid: yaml: content:");

      const result = await parseComposeFile(composePath);
      expect(result).toBeNull();
    });

    test("returns null for compose file without services", async () => {
      const composePath = path.join(tempDir, "no-services.yml");
      await Bun.write(
        composePath,
        `
version: "3.8"
volumes:
  data:
`,
      );

      const result = await parseComposeFile(composePath);
      expect(result).toBeNull();
    });
  });

  describe("getServiceVolumes", () => {
    test("parses short syntax named volumes", async () => {
      const composePath = path.join(tempDir, "short-syntax.yml");
      await Bun.write(
        composePath,
        `
version: "3.8"
services:
  app:
    image: node
    volumes:
      - app_data:/app/data
      - cache:/app/cache:ro
`,
      );

      const composeFile = assertComposeFile(
        await parseComposeFile(composePath),
      );

      const volumes = getServiceVolumes(composeFile, "app");

      expect(volumes).toHaveLength(2);
      expect(volumes[0]).toEqual({
        source: "app_data",
        target: "/app/data",
        type: "volume",
        readOnly: false,
      });
      expect(volumes[1]).toEqual({
        source: "cache",
        target: "/app/cache",
        type: "volume",
        readOnly: true,
      });
    });

    test("parses bind mount syntax", async () => {
      const composePath = path.join(tempDir, "bind-mount.yml");
      await Bun.write(
        composePath,
        `
version: "3.8"
services:
  app:
    image: node
    volumes:
      - ./src:/app/src
      - /etc/config:/app/config:ro
`,
      );

      const composeFile = assertComposeFile(
        await parseComposeFile(composePath),
      );
      const volumes = getServiceVolumes(composeFile, "app");

      expect(volumes).toHaveLength(2);
      expect(volumes[0]!.type).toBe("bind");
      expect(volumes[0]!.source).toBe("./src");
      expect(volumes[1]!.type).toBe("bind");
      expect(volumes[1]!.readOnly).toBe(true);
    });

    test("parses long syntax volumes", async () => {
      const composePath = path.join(tempDir, "long-syntax.yml");
      await Bun.write(
        composePath,
        `
version: "3.8"
services:
  app:
    image: node
    volumes:
      - type: volume
        source: app_data
        target: /app/data
        read_only: true
`,
      );

      const composeFile = assertComposeFile(
        await parseComposeFile(composePath),
      );
      const volumes = getServiceVolumes(composeFile, "app");

      expect(volumes).toHaveLength(1);
      expect(volumes[0]).toEqual({
        source: "app_data",
        target: "/app/data",
        type: "volume",
        readOnly: true,
      });
    });

    test("returns empty array for service without volumes", async () => {
      const composePath = path.join(tempDir, "no-volumes.yml");
      await Bun.write(
        composePath,
        `
version: "3.8"
services:
  app:
    image: node
`,
      );

      const composeFile = assertComposeFile(
        await parseComposeFile(composePath),
      );
      const volumes = getServiceVolumes(composeFile, "app");

      expect(volumes).toEqual([]);
    });

    test("returns empty array for non-existent service", async () => {
      const composePath = path.join(tempDir, "test-service.yml");
      await Bun.write(
        composePath,
        `
version: "3.8"
services:
  app:
    image: node
`,
      );

      const composeFile = assertComposeFile(
        await parseComposeFile(composePath),
      );
      const volumes = getServiceVolumes(composeFile, "nonexistent");

      expect(volumes).toEqual([]);
    });
  });

  describe("getServiceNamedVolumes", () => {
    test("filters out bind mounts", async () => {
      const composePath = path.join(tempDir, "mixed-volumes.yml");
      await Bun.write(
        composePath,
        `
version: "3.8"
services:
  app:
    image: node
    volumes:
      - app_data:/app/data
      - ./src:/app/src
      - cache:/app/cache
      - /tmp:/app/tmp
`,
      );

      const composeFile = assertComposeFile(
        await parseComposeFile(composePath),
      );
      const namedVolumes = getServiceNamedVolumes(composeFile, "app");

      expect(namedVolumes).toEqual(["app_data", "cache"]);
    });
  });

  describe("getComposeVolumes", () => {
    test("returns all defined volumes", async () => {
      const composePath = path.join(tempDir, "defined-volumes.yml");
      await Bun.write(
        composePath,
        `
version: "3.8"
services:
  app:
    image: node
volumes:
  data:
  cache:
  logs:
`,
      );

      const composeFile = assertComposeFile(
        await parseComposeFile(composePath),
      );
      const volumes = getComposeVolumes(composeFile);

      expect(volumes).toEqual(["data", "cache", "logs"]);
    });

    test("returns empty array when no volumes defined", async () => {
      const composePath = path.join(tempDir, "no-defined-volumes.yml");
      await Bun.write(
        composePath,
        `
version: "3.8"
services:
  app:
    image: node
`,
      );

      const composeFile = assertComposeFile(
        await parseComposeFile(composePath),
      );
      const volumes = getComposeVolumes(composeFile);

      expect(volumes).toEqual([]);
    });
  });

  describe("inferProjectName", () => {
    test("extracts directory name from path", () => {
      expect(inferProjectName("/home/user/myproject/docker-compose.yml")).toBe(
        "myproject",
      );
      expect(inferProjectName("/var/www/webapp/compose.yml")).toBe("webapp");
    });

    test("converts to lowercase", () => {
      expect(inferProjectName("/home/user/MyProject/docker-compose.yml")).toBe(
        "myproject",
      );
    });

    test("removes special characters", () => {
      expect(
        inferProjectName("/home/user/my-project_v2/docker-compose.yml"),
      ).toBe("myprojectv2");
      expect(inferProjectName("/home/user/my.project/docker-compose.yml")).toBe(
        "myproject",
      );
    });

    test("handles edge cases", () => {
      expect(inferProjectName("docker-compose.yml")).toBe("default");
      expect(inferProjectName("/docker-compose.yml")).toBe("default");
    });
  });
});
