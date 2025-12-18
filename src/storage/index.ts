/**
 * Storage module exports
 */

import type { BackitupConfig, IStorageProvider } from "../types";
import { LocalStorageProvider } from "./local";
import { S3StorageProvider } from "./s3";

// Provider classes
// Legacy exports for backward compatibility
export {
  deleteFromLocal,
  ensureLocalDir,
  getLocalFileChecksum,
  isPathWithinDir,
  LocalStorageProvider,
  localFileExists,
  saveToLocal,
} from "./local";
export {
  buildS3Key,
  deleteFromS3,
  getS3Client,
  getS3ObjectSize,
  initS3Client,
  isKeyWithinPrefix,
  S3StorageProvider,
  s3ObjectExists,
  uploadToS3,
} from "./s3";

/**
 * Create storage providers based on config
 */
export function createStorageProviders(
  config: BackitupConfig,
): IStorageProvider[] {
  const providers: IStorageProvider[] = [];

  if (config.local.enabled) {
    providers.push(new LocalStorageProvider(config.local));
  }

  if (config.s3.enabled) {
    providers.push(new S3StorageProvider(config.s3));
  }

  return providers;
}
