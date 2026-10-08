import "server-only";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHmac } from "node:crypto";
import { promisify } from "node:util";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { tmpdir } from "node:os";

export type StoredFolder = { id: string; name: string; parentId: string | null; createdAt: string; passwordHash: string | null; ownerHash: string; recoveryHash: string | null };
export type StoredFile = { id: string; name: string; size: number; contentType: string; folderId: string | null; createdAt: string; passwordHash: string | null; ownerHash: string; recoveryHash: string | null };
export type Catalog = { folders: StoredFolder[]; files: StoredFile[] };
const maxBytes = 2 * 1024 * 1024 * 1024;
const configuredRoot = process.env.FOLIO_DATA_DIR;
const fallbackRoot = join(tmpdir(), "folio-public-library");
let root = configuredRoot || join(process.cwd(), ".data", "public-library");
let rootReady = false;
let fallbackSelected = false;
const scrypt = promisify(scryptCallback);
const tokenSecret = process.env.FILE_ACCESS_SECRET || randomBytes(32).toString("hex");
let writeQueue: Promise<unknown> = Promise.resolve();

export function newSecret() { return randomBytes(24).toString("base64url"); }
export function blobPath(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid file id.");
  return join(root, "blobs", `${id}.blob`);
}
export function pendingFilePath(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid upload id.");
  return join(root, "pending", `${id}.upload`);
}

async function ensureWritableRoot() {
  if (rootReady) return;
  const probe = join(root, `.write-check-${process.pid}`);
  try {
    await mkdir(root, { recursive: true });
    const { writeFile } = await import("node:fs/promises");
    await writeFile(probe, "ok", { flag: "w", mode: 0o600 });
    await rm(probe, { force: true });
    rootReady = true;
  } catch (error) {
    await rm(probe, { force: true }).catch(() => undefined);
    if (configuredRoot || fallbackSelected) throw error;
    root = fallbackRoot;
    fallbackSelected = true;
    await mkdir(root, { recursive: true });
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(root, `.write-check-${process.pid}`), "ok", { flag: "w", mode: 0o600 });
    await rm(join(root, `.write-check-${process.pid}`), { force: true });
    rootReady = true;
  }
}

export async function readCatalog(): Promise<Catalog> {
  await ensureWritableRoot();
  try { return JSON.parse(await readFile(join(root, "catalog.json"), "utf8")) as Catalog; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { folders: [], files: [] }; throw error; }
}

export async function updateCatalog<T>(update: (catalog: Catalog) => Promise<T> | T): Promise<T> {
  const run = writeQueue.then(async () => {
    const catalog = await readCatalog();
    const result = await update(catalog);
    await ensureWritableRoot();
    const catalogPath = join(root, "catalog.json");
    const temp = `${catalogPath}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    await writeFileAtomic(temp, JSON.stringify(catalog));
    await rename(temp, catalogPath);
    return result;
  });
  writeQueue = run.catch(() => undefined);
  return run;
}

async function writeFileAtomic(path: string, content: string) {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path, content, { encoding: "utf8", mode: 0o600 });
}

export async function saveUpload(id: string, body: ReadableStream<Uint8Array>) {
  await ensureWritableRoot();
  await mkdir(join(root, "pending"), { recursive: true });
  let bytes = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > maxBytes) callback(new Error("FILE_TOO_LARGE"));
      else callback(null, chunk);
    },
  });
  const path = pendingFilePath(id);
  await pipeline(Readable.fromWeb(body as import("node:stream/web").ReadableStream), limiter, createWriteStream(path, { flags: "wx", mode: 0o600 }));
  return bytes;
}

export async function finishUpload(id: string, expectedSize: number) {
  await ensureWritableRoot();
  await mkdir(join(root, "blobs"), { recursive: true });
  const pending = pendingFilePath(id);
  const actual = (await stat(pending)).size;
  if (actual !== expectedSize) throw new Error("UPLOAD_SIZE_MISMATCH");
  await rename(pending, blobPath(id));
}

export async function removeStoredFile(id: string) {
  await Promise.all([rm(blobPath(id), { force: true }), rm(pendingFilePath(id), { force: true })]);
}

export async function hashSecret(value: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(value, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

export async function verifySecret(value: string, saved: string | null) {
  if (!saved) return true;
  const [salt, encoded] = saved.split(":");
  if (!salt || !encoded) return false;
  const expected = Buffer.from(encoded, "hex");
  const actual = (await scrypt(value, salt, expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function issueAccessToken(id: string) {
  const expires = Date.now() + 5 * 60 * 1000;
  const payload = `${id}:${expires}`;
  const signature = createHmac("sha256", tokenSecret).update(payload).digest("base64url");
  return `${expires}.${signature}`;
}

export function verifyAccessToken(id: string, token: string | null) {
  if (!token) return false;
  const [expiresText, signature] = token.split(".");
  const expires = Number(expiresText);
  if (!expires || expires < Date.now() || !signature) return false;
  const expected = createHmac("sha256", tokenSecret).update(`${id}:${expires}`).digest();
  let actual: Buffer;
  try { actual = Buffer.from(signature, "base64url"); } catch { return false; }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
