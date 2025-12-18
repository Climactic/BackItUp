/**
 * Local filesystem storage provider
 */

import * as path from "node:path";
import { $ } from "bun";
import type {
  IStorageProvider,
  LocalStorageConfig,
  SaveResult,
  StorageLocation,
} from "../types";
import { computeFileChecksum } from "../utils/crypto";
import { logger } from "../utils/logger";

export class LocalStorageProvider implements IStorageProvider {
  readonly type = "local" as const;

  constructor(private readonly config: LocalStorageConfig) {}

  async save(sourcePath: string, archiveName: string): Promise<SaveResult> {
    await this.ensureDir(this.config.path);
    const destPath = path.join(this.config.path, archiveName);

    logger.debug(`Copying archive to local storage: ${destPath}`);
    await $`cp ${sourcePath} ${destPath}`;

    // Verify the copy
    const sourceChecksum = await computeFileChecksum(sourcePath);
    const destChecksum = await computeFileChecksum(destPath);

    if (sourceChecksum !== destChecksum) {
      await $`rm -f ${destPath}`.quiet();
      throw new Error("Checksum mismatch after copying to local storage");
    }

    logger.info(`Saved to local storage: ${destPath}`);

    return {
      location: { type: "local", path: destPath },
      checksum: destChecksum,
    };
  }

  async delete(location: StorageLocation): Promise<void> {
    if (!location.path) {
      throw new Error("Local storage location requires path");
    }

    const file = Bun.file(location.path);
    if (!(await file.exists())) {
      logger.warn(`Local file not found (already deleted?): ${location.path}`);
      return;
    }

    await $`rm -f ${location.path}`;
    logger.debug(`Deleted local file: ${location.path}`);
  }

  async exists(location: StorageLocation): Promise<boolean> {
    if (!location.path) return false;
    const file = Bun.file(location.path);
    return await file.exists();
  }

  async getChecksum(location: StorageLocation): Promise<string | null> {
    if (!location.path) return null;
    const file = Bun.file(location.path);
    if (!(await file.exists())) return null;
    return computeFileChecksum(location.path);
  }

  private async ensureDir(dirPath: string): Promise<void> {
    await $`mkdir -p ${dirPath}`;
  }
}

// Legacy function exports for backward compatibility
export async function ensureLocalDir(dirPath: string): Promise<void> {
  await $`mkdir -p ${dirPath}`;
}

export async function saveToLocal(
  sourcePath: string,
  destDir: string,
  archiveName: string,
): Promise<string> {
  const provider = new LocalStorageProvider({ enabled: true, path: destDir });
  const result = await provider.save(sourcePath, archiveName);
  return result.location.path ?? "";
}

export async function deleteFromLocal(filePath: string): Promise<void> {
  const provider = new LocalStorageProvider({
    enabled: true,
    path: path.dirname(filePath),
  });
  await provider.delete({ type: "local", path: filePath });
}

export async function localFileExists(filePath: string): Promise<boolean> {
  const file = Bun.file(filePath);
  return await file.exists();
}

export async function getLocalFileChecksum(
  filePath: string,
): Promise<string | null> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) return null;
  return computeFileChecksum(filePath);
}

// Re-export path utility for backward compatibility
export { isPathWithinDir } from "../utils/path";
