import { readCatalog } from "@/lib/shared-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const catalog = await readCatalog();
    return Response.json({
      folders: catalog.folders.map(({ id, name, parentId, createdAt, passwordHash }) => ({ id, name, parentId, createdAt, protected: Boolean(passwordHash) })),
      files: catalog.files.map(({ id, name, size, contentType, folderId, createdAt, passwordHash }) => ({ id, name, size, contentType, folderId, createdAt, protected: Boolean(passwordHash) })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "The public library could not be read. Refresh and try again." }, { status: 503 }); }
}
