import { z } from "zod";
import { finishUpload, hashSecret, readCatalog, updateCatalog } from "@/lib/shared-store";

const schema = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(255), size: z.number().int().positive().max(2 * 1024 * 1024 * 1024), contentType: z.string().max(255), folderId: z.string().uuid().nullable(), ownerKey: z.string().min(20).max(128) });

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Send valid file details." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "The file details are invalid or exceed 2 GB." }, { status: 400 });
  const item = parsed.data;
  try {
    const catalog = await readCatalog();
    if (catalog.files.some((file) => file.id === item.id)) return Response.json({ error: "That upload was already added." }, { status: 409 });
    if (item.folderId && !catalog.folders.some((folder) => folder.id === item.folderId)) return Response.json({ error: "The destination folder no longer exists." }, { status: 404 });
    if (item.folderId && !catalog.folders.some((folder) => folder.id === item.folderId)) return Response.json({ error: "The destination folder no longer exists." }, { status: 404 });
    await finishUpload(item.id, item.size);
    const file = { id: item.id, name: item.name, size: item.size, contentType: item.contentType || "application/octet-stream", folderId: item.folderId, createdAt: new Date().toISOString(), passwordHash: null, ownerHash: await hashSecret(item.ownerKey), recoveryHash: null };
    await updateCatalog((current) => { current.files.push(file); });
    return Response.json({ ...file, passwordHash: undefined, ownerHash: undefined, recoveryHash: undefined, protected: false }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error && error.message === "UPLOAD_SIZE_MISMATCH" ? "The received file size did not match. Upload it again." : "Could not finish the upload. Try again." }, { status: 503 });
  }
}
