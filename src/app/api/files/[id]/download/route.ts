import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { blobPath, readCatalog, verifyAccessToken } from "@/lib/shared-store";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const catalog = await readCatalog();
    const file = catalog.files.find((entry) => entry.id === id);
    if (!file) return Response.json({ error: "File not found." }, { status: 404 });
    let protectedAccess = Boolean(file.passwordHash);
    let folder = catalog.folders.find((entry) => entry.id === file.folderId);
    while (folder) {
      protectedAccess ||= Boolean(folder.passwordHash);
      folder = catalog.folders.find((entry) => entry.id === folder?.parentId);
    }
    const url = new URL(request.url);
    if (protectedAccess && !verifyAccessToken(id, url.searchParams.get("token"))) return Response.json({ error: "Enter the password to access this file." }, { status: 401 });
    const download = url.searchParams.get("download") === "1";
    const disposition = download ? "attachment" : "inline";
    return new Response(Readable.toWeb(createReadStream(blobPath(id))) as ReadableStream, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "Content-Length": String(file.size),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch { return Response.json({ error: "The file is not available on this server." }, { status: 404 }); }
}
