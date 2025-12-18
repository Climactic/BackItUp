/**
 * Archive creation for backups
 */

import * as os from "node:os";
import * as path from "node:path";
import { $ } from "bun";
import type { SourceConfig } from "../../types";
import { computeFileChecksum } from "../../utils/crypto";
import { logger } from "../../utils/logger";
import { generateArchiveName } from "../../utils/naming";
import { type CollectedFile, collectFiles } from "./file-collector";

export interface ArchiveResult {
  archivePath: string;
  archiveName: string;
  checksum: string;
  sizeBytes: number;
  filesCount: number;
  sourcePaths: string[];
}

export async function createArchive(
  sources: SourceConfig[],
  schedule: string,
  prefix: string = "backitup",
  compression: number = 6,
  sourceNames?: string[],
): Promise<ArchiveResult> {
  logger.info(`Creating archive for schedule: ${schedule}`);

  const { files, sourcePaths } = await collectFiles(sources);

  if (files.length === 0) {
    throw new Error("No files found to archive");
  }

  logger.info(`Found ${files.length} files to archive`);

  const tempDir = path.join(os.tmpdir(), `backitup-${Date.now()}`);
  await $`mkdir -p ${tempDir}`;

  try {
    await stageFiles(files, tempDir);

    const archiveName = generateArchiveName(schedule, prefix, sourceNames);
    const archivePath = path.join(tempDir, archiveName);

    await createTarGzip(tempDir, archivePath, compression);

    const archiveFile = Bun.file(archivePath);
    const sizeBytes = archiveFile.size;
    const checksum = await computeFileChecksum(archivePath);

    logger.info(`Archive created: ${archiveName} (${sizeBytes} bytes)`);

    return {
      archivePath,
      archiveName,
      checksum,
      sizeBytes,
      filesCount: files.length,
      sourcePaths,
    };
  } catch (error) {
    await $`rm -rf ${tempDir}`.quiet();
    throw error;
  }
}

async function stageFiles(
  files: CollectedFile[],
  tempDir: string,
): Promise<void> {
  const dirsCreated = new Set<string>();

  for (const file of files) {
    const targetPath = path.join(tempDir, file.relativePath);
    const targetDir = path.dirname(targetPath);

    if (!dirsCreated.has(targetDir)) {
      await $`mkdir -p ${targetDir}`;
      dirsCreated.add(targetDir);
    }

    try {
      await $`ln ${file.absolutePath} ${targetPath}`.quiet();
    } catch {
      await $`cp ${file.absolutePath} ${targetPath}`;
    }
  }
}

async function createTarGzip(
  tempDir: string,
  archivePath: string,
  compression: number,
): Promise<void> {
  logger.debug(`Creating tar.gz archive with compression level ${compression}`);

  const entries = await Array.fromAsync(
    new Bun.Glob("*").scan({ cwd: tempDir, onlyFiles: false }),
  );
  const archiveEntries = entries.filter((e) => !e.endsWith(".tar.gz"));

  if (archiveEntries.length === 0) {
    throw new Error("No entries to archive");
  }

  const tarResult =
    await $`tar -cf - -C ${tempDir} ${archiveEntries} | gzip -${compression} > ${archivePath}`.quiet();

  if (tarResult.exitCode !== 0) {
    throw new Error(`Failed to create archive: ${tarResult.stderr.toString()}`);
  }
}

export async function cleanupTempArchive(archivePath: string): Promise<void> {
  const tempDir = path.dirname(archivePath);
  if (tempDir.includes("backitup-") && tempDir.startsWith(os.tmpdir())) {
    await $`rm -rf ${tempDir}`.quiet();
    logger.debug(`Cleaned up temp directory: ${tempDir}`);
  }
}
