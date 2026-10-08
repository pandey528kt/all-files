import { removeStoredFile, updateCatalog, verifySecret } from "@/lib/shared-store";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { ownerKey?: string };
  try { body = await request.json(); } catch { return Response.json({ error: "Folder creator verification is required." }, { status: 400 }); }
  const result = await updateCatalog(async (catalog) => {
    const root = catalog.folders.find((entry) => entry.id === id);
    if (!root) return { status: "missing" as const, removeFiles: [] as string[] };
    if (!body.ownerKey || !(await verifySecret(body.ownerKey, root.ownerHash))) return { status: "forbidden" as const, removeFiles: [] as string[] };
    const ids = new Set([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const folder of catalog.folders) if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) { ids.add(folder.id); changed = true; }
    }
    const removeFiles = catalog.files.filter((file) => file.folderId && ids.has(file.folderId)).map((file) => file.id);
    catalog.files = catalog.files.filter((file) => !file.folderId || !ids.has(file.folderId));
    catalog.folders = catalog.folders.filter((folder) => !ids.has(folder.id));
    return { status: "deleted" as const, removeFiles };
  });
  if (result.status === "missing") return Response.json({ error: "Folder not found." }, { status: 404 });
  if (result.status === "forbidden") return Response.json({ error: "Only the folder creator can delete it." }, { status: 403 });
  await Promise.all(result.removeFiles.map(removeStoredFile));
  return Response.json({ deleted: true });
}
