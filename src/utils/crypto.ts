import { createHash } from "node:crypto";

export async function computeFileChecksum(filePath: string): Promise<string> {
  const file = Bun.file(filePath);
  const buffer = await file.arrayBuffer();
  const hash = createHash("sha256");
  hash.update(Buffer.from(buffer));
  return hash.digest("hex");
}

export function computeStringHash(content: string): string {
  const hash = createHash("sha256");
  hash.update(content);
  return hash.digest("hex");
}

export function computeConfigHash(config: object): string {
  const normalized = JSON.stringify(config, Object.keys(config).sort());
  return computeStringHash(normalized).slice(0, 16);
}

export function generateShortId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const randomBytes = crypto.getRandomValues(new Uint8Array(6));
  for (const byte of randomBytes) {
    result += chars[byte % chars.length];
  }
  return result;
}

export function generateUUID(): string {
  return crypto.randomUUID();
}
