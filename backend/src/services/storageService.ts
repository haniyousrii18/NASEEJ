import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { ENV } from '../config/env.js';

/**
 * Protected file storage. Files live outside any public web root and are only ever served through an
 * authorized API route. Stored names are random UUIDs; client file names are kept as metadata only.
 */
export function storageRoot(): string {
  return path.resolve(process.cwd(), ENV.STORAGE_DIR);
}

/** Resolves a stored relative path and refuses anything that escapes the storage root. */
export function resolveStoredPath(relativePath: string): string | null {
  const root = storageRoot();
  const full = path.resolve(root, relativePath);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

export async function saveFile(buffer: Buffer, extension: string): Promise<string> {
  const now = new Date();
  const relative = path.posix.join(String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, '0'), `${randomUUID()}${extension}`);
  const full = resolveStoredPath(relative);
  if (!full) throw new Error('Invalid storage path');
  await fs.promises.mkdir(path.dirname(full), { recursive: true });
  await fs.promises.writeFile(full, buffer, { flag: 'wx' });
  return relative;
}

export async function fileExists(relativePath: string): Promise<boolean> {
  const full = resolveStoredPath(relativePath);
  if (!full) return false;
  try {
    await fs.promises.access(full, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/** Detects the real type from the first bytes. The client-declared MIME type is never trusted. */
export function sniffFileType(buffer: Buffer): { mime: string; extension: string } | null {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', extension: '.pdf' };
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', extension: '.png' };
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mime: 'image/jpeg', extension: '.jpg' };
  return null;
}
