/**
 * S3 storage provider
 */

import { S3Client } from "bun";
import type { IStorageProvider, S3StorageConfig, SaveResult, StorageLocation } from "../types";
import { logger } from "../utils/logger";

let globalS3Client: S3Client | null = null;

export class S3StorageProvider implements IStorageProvider {
  readonly type = "s3" as const;
  private client: S3Client;

  constructor(private readonly config: S3StorageConfig) {
    this.client = this.createClient();
  }

  private createClient(): S3Client {
    const accessKeyId =
      this.config.accessKeyId ?? process.env.S3_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey =
      this.config.secretAccessKey ??
      process.env.S3_SECRET_ACCESS_KEY ??
      process.env.AWS_SECRET_ACCESS_KEY;
    const region =
      this.config.region ?? process.env.S3_REGION ?? process.env.AWS_REGION ?? "us-east-1";
    const endpoint = this.config.endpoint ?? process.env.S3_ENDPOINT;

    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        "S3 credentials not found. Set accessKeyId/secretAccessKey in config or S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY environment variables.",
      );
    }

    return new S3Client({
      accessKeyId,
      secretAccessKey,
      bucket: this.config.bucket,
      region,
      endpoint,
    });
  }

  async save(sourcePath: string, archiveName: string): Promise<SaveResult> {
    const key = this.buildKey(archiveName);

    logger.debug(`Uploading to S3: s3://${this.config.bucket}/${key}`);

    const file = Bun.file(sourcePath);
    if (!(await file.exists())) {
      throw new Error(`Local file not found: ${sourcePath}`);
    }

    await this.client.write(key, file, { type: "application/gzip" });

    // Verify upload
    const exists = await this.client.exists(key);
    if (!exists) {
      throw new Error(`S3 upload verification failed: s3://${this.config.bucket}/${key}`);
    }

    logger.info(`Uploaded to S3: s3://${this.config.bucket}/${key}`);

    return {
      location: { type: "s3", bucket: this.config.bucket, key },
      checksum: "", // S3 doesn't return checksum in this API
    };
  }

  async delete(location: StorageLocation): Promise<void> {
    if (!location.key) {
      throw new Error("S3 storage location requires key");
    }

    const exists = await this.client.exists(location.key);
    if (!exists) {
      logger.warn(
        `S3 object not found (already deleted?): s3://${location.bucket}/${location.key}`,
      );
      return;
    }

    await this.client.delete(location.key);
    logger.debug(`Deleted S3 object: s3://${location.bucket}/${location.key}`);
  }

  async exists(location: StorageLocation): Promise<boolean> {
    if (!location.key) return false;
    return await this.client.exists(location.key);
  }

  async getChecksum(_location: StorageLocation): Promise<string | null> {
    // S3 doesn't provide direct checksum access in this API
    return null;
  }

  private buildKey(archiveName: string): string {
    if (this.config.prefix) {
      const prefix = this.config.prefix.endsWith("/")
        ? this.config.prefix
        : `${this.config.prefix}/`;
      return `${prefix}${archiveName}`;
    }
    return archiveName;
  }
}

// Legacy function exports for backward compatibility
export function initS3Client(config: S3StorageConfig): S3Client {
  const accessKeyId =
    config.accessKeyId ?? process.env.S3_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey =
    config.secretAccessKey ?? process.env.S3_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY;
  const region = config.region ?? process.env.S3_REGION ?? process.env.AWS_REGION ?? "us-east-1";
  const endpoint = config.endpoint ?? process.env.S3_ENDPOINT;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "S3 credentials not found. Set accessKeyId/secretAccessKey in config or S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY environment variables.",
    );
  }

  globalS3Client = new S3Client({
    accessKeyId,
    secretAccessKey,
    bucket: config.bucket,
    region,
    endpoint,
  });

  logger.debug(`S3 client initialized for bucket: ${config.bucket}`);
  return globalS3Client;
}

export function getS3Client(): S3Client {
  if (!globalS3Client) {
    throw new Error("S3 client not initialized. Call initS3Client() first.");
  }
  return globalS3Client;
}

export function buildS3Key(
  globalPrefix: string | undefined,
  sourceFolder: string,
  archiveName: string,
): string {
  const parts: string[] = [];
  if (globalPrefix) parts.push(globalPrefix.replace(/\/$/, ""));
  if (sourceFolder) parts.push(sourceFolder.replace(/\/$/, ""));
  parts.push(archiveName);
  return parts.join("/");
}

export async function uploadToS3(
  localPath: string,
  config: S3StorageConfig,
  archiveName: string,
  sourceFolder: string,
): Promise<{ bucket: string; key: string }> {
  const client = getS3Client();
  const key = buildS3Key(config.prefix, sourceFolder, archiveName);

  logger.debug(`Uploading to S3: s3://${config.bucket}/${key}`);

  const file = Bun.file(localPath);
  if (!(await file.exists())) {
    throw new Error(`Local file not found: ${localPath}`);
  }

  await client.write(key, file, { type: "application/gzip" });

  const exists = await client.exists(key);
  if (!exists) {
    throw new Error(`S3 upload verification failed: s3://${config.bucket}/${key}`);
  }

  logger.info(`Uploaded to S3: s3://${config.bucket}/${key}`);
  return { bucket: config.bucket, key };
}

export async function deleteFromS3(bucket: string, key: string): Promise<void> {
  const client = getS3Client();
  const exists = await client.exists(key);
  if (!exists) {
    logger.warn(`S3 object not found (already deleted?): s3://${bucket}/${key}`);
    return;
  }
  await client.delete(key);
  logger.debug(`Deleted S3 object: s3://${bucket}/${key}`);
}

export async function s3ObjectExists(key: string): Promise<boolean> {
  const client = getS3Client();
  return await client.exists(key);
}

export async function getS3ObjectSize(key: string): Promise<number | null> {
  const client = getS3Client();
  try {
    const file = client.file(key);
    const stat = await file.stat();
    return stat?.size ?? null;
  } catch {
    return null;
  }
}

export function isKeyWithinPrefix(key: string, prefix: string | undefined): boolean {
  if (!prefix) return true;
  const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return key.startsWith(normalizedPrefix);
}
