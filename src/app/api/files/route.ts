import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { db } from "@/lib/db";
import { files, folders } from "@/lib/schema";
import { getStorage } from "@/lib/r2";

const finalizeSchema = createInsertSchema(files).pick({ id: true, name: true, size: true, contentType: true, folderId: true }).extend({
  id: z.string().uuid(), name: z.string().trim().min(1).max(255), size: z.number().int().positive().max(2 * 1024 * 1024 * 1024),
  contentType: z.string().max(255).default("application/octet-stream"), folderId: z.string().uuid().nullable().optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Send valid file details." }, { status: 400 }); }
  const parsed = finalizeSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "The file details are invalid or exceed the 2 GB limit." }, { status: 400 });
  const { id, name, size, contentType, folderId } = parsed.data;
  const objectKey = `uploads/${id}`;
  try {
    if (folderId && !(await db.query.folders.findFirst({ where: eq(folders.id, folderId), columns: { id: true } }))) return Response.json({ error: "The destination folder no longer exists." }, { status: 404 });
    const { client, bucket } = getStorage();
    const stored = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
    if (stored.ContentLength !== size) return Response.json({ error: "The stored upload size did not match. Upload again." }, { status: 400 });
    const [created] = await db.insert(files).values({ id, name, size, contentType, folderId: folderId ?? null, objectKey }).returning({ id: files.id, name: files.name, size: files.size, contentType: files.contentType, folderId: files.folderId, createdAt: files.createdAt });
    return Response.json(created, { status: 201 });
  } catch { return Response.json({ error: "Could not finish saving the upload. Try again." }, { status: 503 }); }
}
