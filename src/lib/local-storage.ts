import "server-only";
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";

const uploadDir = process.env.FOLIO_UPLOAD_DIR || join(process.cwd(), ".data", "uploads");

export function localObjectPath(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid file id.");
  return join(uploadDir, `${id}.blob`);
}

export async function ensureLocalUploadDirectory() {
  await mkdir(uploadDir, { recursive: true });
}

export async function localObjectSize(id: string) {
  const info = await stat(localObjectPath(id));
  return info.size;
}
