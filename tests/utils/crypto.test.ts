import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as os from "node:os";
import * as path from "node:path";
import { $ } from "bun";
import {
  computeConfigHash,
  computeFileChecksum,
  computeStringHash,
  generateShortId,
  generateUUID,
} from "../../src/utils/crypto";

describe("crypto utilities", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = path.join(os.tmpdir(), `backitup-test-${Date.now()}`);
    await $`mkdir -p ${tempDir}`;
  });

  afterAll(async () => {
    await $`rm -rf ${tempDir}`.quiet();
  });

  describe("computeFileChecksum", () => {
    test("computes SHA256 checksum of a file", async () => {
      const testFile = path.join(tempDir, "test.txt");
      await Bun.write(testFile, "hello world");

      const checksum = await computeFileChecksum(testFile);

      // SHA256 of "hello world"
      expect(checksum).toBe("b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9");
    });

    test("returns different checksums for different content", async () => {
      const file1 = path.join(tempDir, "file1.txt");
      const file2 = path.join(tempDir, "file2.txt");
      await Bun.write(file1, "content 1");
      await Bun.write(file2, "content 2");

      const checksum1 = await computeFileChecksum(file1);
      const checksum2 = await computeFileChecksum(file2);

      expect(checksum1).not.toBe(checksum2);
    });

    test("returns same checksum for same content", async () => {
      const file1 = path.join(tempDir, "same1.txt");
      const file2 = path.join(tempDir, "same2.txt");
      await Bun.write(file1, "identical content");
      await Bun.write(file2, "identical content");

      const checksum1 = await computeFileChecksum(file1);
      const checksum2 = await computeFileChecksum(file2);

      expect(checksum1).toBe(checksum2);
    });

    test("handles empty file", async () => {
      const emptyFile = path.join(tempDir, "empty.txt");
      await Bun.write(emptyFile, "");

      const checksum = await computeFileChecksum(emptyFile);

      // SHA256 of empty string
      expect(checksum).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    });

    test("handles binary content", async () => {
      const binaryFile = path.join(tempDir, "binary.bin");
      const binaryData = new Uint8Array([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);
      await Bun.write(binaryFile, binaryData);

      const checksum = await computeFileChecksum(binaryFile);

      expect(checksum).toHaveLength(64); // SHA256 hex is 64 chars
    });
  });

  describe("computeStringHash", () => {
    test("computes SHA256 hash of a string", () => {
      const hash = computeStringHash("hello world");
      expect(hash).toBe("b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9");
    });

    test("returns consistent hash for same input", () => {
      const hash1 = computeStringHash("test");
      const hash2 = computeStringHash("test");
      expect(hash1).toBe(hash2);
    });

    test("returns different hash for different input", () => {
      const hash1 = computeStringHash("test1");
      const hash2 = computeStringHash("test2");
      expect(hash1).not.toBe(hash2);
    });

    test("handles empty string", () => {
      const hash = computeStringHash("");
      expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    });

    test("handles unicode characters", () => {
      const hash = computeStringHash("hello 世界 🌍");
      expect(hash).toHaveLength(64);
    });
  });

  describe("computeConfigHash", () => {
    test("computes 16-character hash of config object", () => {
      const hash = computeConfigHash({ key: "value" });
      expect(hash).toHaveLength(16);
    });

    test("returns consistent hash for same config", () => {
      const config = { name: "test", enabled: true };
      const hash1 = computeConfigHash(config);
      const hash2 = computeConfigHash(config);
      expect(hash1).toBe(hash2);
    });

    test("returns same hash regardless of key order", () => {
      const config1 = { a: 1, b: 2, c: 3 };
      const config2 = { c: 3, a: 1, b: 2 };
      const hash1 = computeConfigHash(config1);
      const hash2 = computeConfigHash(config2);
      expect(hash1).toBe(hash2);
    });

    test("returns different hash for different config", () => {
      const config1 = { name: "test1" };
      const config2 = { name: "test2" };
      const hash1 = computeConfigHash(config1);
      const hash2 = computeConfigHash(config2);
      expect(hash1).not.toBe(hash2);
    });

    test("handles nested objects", () => {
      const config = {
        level1: {
          level2: {
            value: "deep",
          },
        },
      };
      const hash = computeConfigHash(config);
      expect(hash).toHaveLength(16);
    });
  });

  describe("generateShortId", () => {
    test("generates 6-character ID", () => {
      const id = generateShortId();
      expect(id).toHaveLength(6);
    });

    test("only contains lowercase alphanumeric characters", () => {
      for (let i = 0; i < 100; i++) {
        const id = generateShortId();
        expect(id).toMatch(/^[a-z0-9]+$/);
      }
    });

    test("generates unique IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        ids.add(generateShortId());
      }
      // Should have high uniqueness (collisions very rare)
      expect(ids.size).toBeGreaterThan(990);
    });
  });

  describe("generateUUID", () => {
    test("generates valid UUID format", () => {
      const uuid = generateUUID();
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    test("generates unique UUIDs", () => {
      const uuids = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        uuids.add(generateUUID());
      }
      expect(uuids.size).toBe(1000);
    });

    test("generates UUIDv4 format", () => {
      const uuid = generateUUID();
      // UUID v4 has '4' in the version position
      expect(uuid[14]).toBe("4");
      // And 8, 9, a, or b in the variant position
      expect(uuid[19]).toMatch(/[89ab]/);
    });
  });
});
