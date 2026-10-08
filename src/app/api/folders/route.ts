import { z } from "zod";
import { hashSecret, newSecret, readCatalog, updateCatalog } from "@/lib/shared-store";

const schema = z.object({ name: z.string().trim().min(1).max(160), parentId: z.string().uuid().nullable(), ownerKey: z.string().min(20).max(128) });

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Send a valid folder request." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Enter a folder name and try again." }, { status: 400 });
  try {
    const catalog = await readCatalog();
    if (parsed.data.parentId && !catalog.folders.some((folder) => folder.id === parsed.data.parentId)) return Response.json({ error: "The parent folder no longer exists." }, { status: 404 });
    if (catalog.folders.some((folder) => folder.parentId === parsed.data.parentId && folder.name.toLowerCase() === parsed.data.name.toLowerCase())) return Response.json({ error: "A folder with that name already exists here." }, { status: 409 });
    const folder = { id: crypto.randomUUID(), name: parsed.data.name, parentId: parsed.data.parentId, createdAt: new Date().toISOString(), passwordHash: null, ownerHash: await hashSecret(parsed.data.ownerKey), recoveryHash: null };
    await updateCatalog((current) => { current.folders.push(folder); });
    return Response.json({ id: folder.id, name: folder.name, parentId: folder.parentId, createdAt: folder.createdAt, protected: false }, { status: 201 });
  } catch { return Response.json({ error: "Could not create the folder. Check server storage and try again." }, { status: 503 }); }
}
