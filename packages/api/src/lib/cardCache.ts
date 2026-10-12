import { mkdir, readFile, stat, writeFile } from "fs/promises";
import path from "path";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const TTL_MS = 60 * 60 * 1000;

function safeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, "_");
}

// --- Local filesystem store -------------------------------------------
// Used whenever R2 isn't configured, which is the case for local dev: it
// writes rendered cards to a real directory so they can be opened and
// inspected directly while testing.
const CACHE_DIR = process.env.CARD_CACHE_DIR ?? path.join(process.cwd(), ".cache", "cards");

function localFilePath(key: string): string {
  return path.join(CACHE_DIR, `${safeKey(key)}.png`);
}

async function getLocalCachedCard(key: string): Promise<Buffer | null> {
  try {
    const file = localFilePath(key);
    const info = await stat(file);
    if (Date.now() - info.mtimeMs > TTL_MS) return null;
    return await readFile(file);
  } catch {
    return null;
  }
}

async function setLocalCachedCard(key: string, png: Buffer): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(localFilePath(key), png);
  } catch {
    // caching is best-effort; a write failure shouldn't break the response
  }
}

// --- Cloudflare R2 store (S3-compatible) -------------------------------
// Used in production once these env vars are set:
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
// (R2_PREFIX is optional, defaults to "cards/"). Until then this whole
// branch is inert and getCachedCard/setCachedCard just use the local
// directory above -- no code changes needed once the bucket exists, just
// set the env vars.
let r2ClientInstance: S3Client | null | undefined;

function getR2Client(): S3Client | null {
  if (r2ClientInstance !== undefined) return r2ClientInstance;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey || !process.env.R2_BUCKET_NAME) {
    r2ClientInstance = null;
    return null;
  }
  r2ClientInstance = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return r2ClientInstance;
}

function r2ObjectKey(key: string): string {
  const prefix = process.env.R2_PREFIX ?? "cards/";
  return `${prefix}${safeKey(key)}.png`;
}

async function getR2CachedCard(client: S3Client, key: string): Promise<Buffer | null> {
  const bucket = process.env.R2_BUCKET_NAME!;
  const objectKey = r2ObjectKey(key);
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
    const lastModified = head.LastModified?.getTime() ?? 0;
    if (Date.now() - lastModified > TTL_MS) return null;

    const obj = await client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }));
    if (!obj.Body) return null;
    return Buffer.from(await obj.Body.transformToByteArray());
  } catch {
    return null;
  }
}

async function setR2CachedCard(client: S3Client, key: string, png: Buffer): Promise<void> {
  const bucket = process.env.R2_BUCKET_NAME!;
  try {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: r2ObjectKey(key), Body: png, ContentType: "image/png" }));
  } catch {
    // caching is best-effort; a write failure shouldn't break the response
  }
}

// --- Public API ----------------------------------------------------------
// Picks whichever store is configured: R2 when its env vars are present
// (production, shared across every instance), otherwise the local
// directory (local dev, single process).
export async function getCachedCard(key: string): Promise<Buffer | null> {
  const client = getR2Client();
  if (client) return getR2CachedCard(client, key);
  return getLocalCachedCard(key);
}

export async function setCachedCard(key: string, png: Buffer): Promise<void> {
  const client = getR2Client();
  if (client) return setR2CachedCard(client, key, png);
  return setLocalCachedCard(key, png);
}
