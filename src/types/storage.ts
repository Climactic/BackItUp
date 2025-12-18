/**
 * Storage provider interface definitions
 */

export type StorageType = "local" | "s3";

export interface StorageLocation {
  type: StorageType;
  path?: string;
  bucket?: string;
  key?: string;
}

export interface SaveResult {
  location: StorageLocation;
  checksum: string;
}

export interface IStorageProvider {
  readonly type: StorageType;

  /**
   * Save a file to storage
   */
  save(sourcePath: string, archiveName: string): Promise<SaveResult>;

  /**
   * Delete a file from storage
   */
  delete(location: StorageLocation): Promise<void>;

  /**
   * Check if a file exists
   */
  exists(location: StorageLocation): Promise<boolean>;

  /**
   * Get the checksum of a stored file
   */
  getChecksum(location: StorageLocation): Promise<string | null>;
}
