import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { files, folders } from "@/lib/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [allFolders, allFiles] = await Promise.all([
      db.select({ id: folders.id, name: folders.name, parentId: folders.parentId, createdAt: folders.createdAt, protected: folders.passwordHash }).from(folders).orderBy(asc(folders.name)),
      db.select({ id: files.id, name: files.name, size: files.size, contentType: files.contentType, folderId: files.folderId, createdAt: files.createdAt, protected: files.passwordHash }).from(files).orderBy(asc(files.name)),
    ]);
    const storageReady = Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME);
    return Response.json({ folders: allFolders.map((item) => ({ ...item, protected: Boolean(item.protected) })), files: allFiles.map((item) => ({ ...item, protected: Boolean(item.protected) })), storageReady }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "The shared library is temporarily unavailable." }, { status: 503 });
  }
}
