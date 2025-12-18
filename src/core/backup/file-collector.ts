/**
 * File collection for backup archives
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { SourceConfig } from "../../types";
import { logger } from "../../utils/logger";

export interface CollectedFile {
  absolutePath: string;
  relativePath: string;
  size: number;
}

async function collectFilesFromSource(source: SourceConfig): Promise<CollectedFile[]> {
  const basePath = path.resolve(source.path);
  const files: CollectedFile[] = [];

  if (!fs.existsSync(basePath)) {
    logger.warn(`Source path does not exist: ${basePath}`);
    return [];
  }

  const patterns = source.patterns ?? ["**/*"];
  const includePatterns = patterns.filter((p) => !p.startsWith("!"));
  const excludePatterns = patterns.filter((p) => p.startsWith("!")).map((p) => p.slice(1));

  // Pre-compile exclude globs for performance
  const excludeGlobs = excludePatterns.map((p) => new Bun.Glob(p));

  for (const pattern of includePatterns) {
    const glob = new Bun.Glob(pattern);

    for await (const match of glob.scan({
      cwd: basePath,
      absolute: false,
      onlyFiles: true,
    })) {
      const absolutePath = path.join(basePath, match);

      // Check if file matches any exclude pattern
      const excluded = excludeGlobs.some((g) => g.match(match));
      if (excluded) continue;

      const file = Bun.file(absolutePath);
      const size = file.size;

      if (!files.some((f) => f.absolutePath === absolutePath)) {
        files.push({ absolutePath, relativePath: match, size });
      }
    }
  }

  return files;
}

export async function collectFiles(sources: SourceConfig[]): Promise<{
  files: CollectedFile[];
  sourcePaths: string[];
}> {
  const allFiles: CollectedFile[] = [];
  const sourcePaths: string[] = [];

  for (const source of sources) {
    const basePath = path.resolve(source.path);
    sourcePaths.push(basePath);

    const files = await collectFilesFromSource(source);
    logger.debug(`Collected ${files.length} files from ${basePath}`);

    const sourceName = path.basename(basePath);
    for (const file of files) {
      allFiles.push({
        ...file,
        relativePath: path.join(sourceName, file.relativePath),
      });
    }
  }

  return { files: allFiles, sourcePaths };
}
