import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { db } from "@/lib/db";
import { files, folders } from "@/lib/schema";
import { getStorage } from "@/lib/r2";
import { localObjectPath } from "@/lib/local-storage";
import { eq } from "drizzle-orm";

const maxFileSize = 2 * 1024 * 1024 * 1024;
const uploadSchema = createInsertSchema(files).pick({ name: true, size: true, contentType: true, folderId: true }).extend({
  name: z.string().trim().min(1).max(255),
  size: z.number().int().positive().max(maxFileSize),
  contentType: z.string().max(255).default("application/octet-stream"),
  folderId: z.string().uuid().nullable().optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Send valid upload details." }, { status: 400 }); }
  const parsed = uploadSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Files must have a name and be no larger than 2 GB." }, { status: 400 });
  const { name, size, contentType, folderId } = parsed.data;
  try {
    if (folderId && !(await db.query.folders.findFirst({ where: eq(folders.id, folderId), columns: { id: true } }))) return Response.json({ error: "The destination folder no longer exists." }, { status: 404 });
    const id = crypto.randomUUID();
    const objectKey = `uploads/${id}`;
    const hasR2 = Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME);
    if (hasR2) {
      const { client, bucket } = getStorage();
      const command = new PutObjectCommand({ Bucket: bucket, Key: objectKey, ContentType: contentType });
      const uploadUrl = await getSignedUrl(client, command, { expiresIn: 600 });
      return Response.json({ id, objectKey, uploadUrl, name, size, contentType, folderId: folderId ?? null, storageMode: "r2" }, { status: 201 });
    }
    const uploadUrl = new URL(`/api/uploads/${id}/content`, request.url).toString();
    localObjectPath(id);
    return Response.json({ id, objectKey, uploadUrl, name, size, contentType, folderId: folderId ?? null, storageMode: "local" }, { status: 201 });
  } catch {
    return Response.json({ error: "File storage is not configured yet. Add the R2 server environment variables and retry." }, { status: 503 });
  }
}
