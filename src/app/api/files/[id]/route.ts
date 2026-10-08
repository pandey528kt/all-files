import { removeStoredFile, updateCatalog, verifySecret } from "@/lib/shared-store";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { ownerKey?: string };
  try { body = await request.json(); } catch { return Response.json({ error: "Uploader verification is required." }, { status: 400 }); }
  const result = await updateCatalog(async (catalog) => {
    const file = catalog.files.find((entry) => entry.id === id);
    if (!file) return "missing" as const;
    if (!body.ownerKey || !(await verifySecret(body.ownerKey, file.ownerHash))) return "forbidden" as const;
    catalog.files = catalog.files.filter((entry) => entry.id !== id);
    return "deleted" as const;
  });
  if (result === "missing") return Response.json({ error: "File not found." }, { status: 404 });
  if (result === "forbidden") return Response.json({ error: "Only the uploader can delete this file." }, { status: 403 });
  await removeStoredFile(id);
  return Response.json({ deleted: true });
}
