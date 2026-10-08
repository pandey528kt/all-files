import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { ensureLocalUploadDirectory, localObjectPath } from "@/lib/local-storage";

export const runtime = "nodejs";
const maxBytes = 2 * 1024 * 1024 * 1024;

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Invalid upload id." }, { status: 400 });
  if (!request.body) return Response.json({ error: "The upload body is empty." }, { status: 400 });
  const declaredSize = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) return Response.json({ error: "Files cannot exceed 2 GB." }, { status: 413 });

  const path = localObjectPath(id);
  let uploadedBytes = 0;
  try {
    await ensureLocalUploadDirectory();
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        uploadedBytes += chunk.length;
        if (uploadedBytes > maxBytes) callback(new Error("FILE_TOO_LARGE"));
        else callback(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(request.body as import("node:stream/web").ReadableStream), limiter, createWriteStream(path, { flags: "wx" }));
    return Response.json({ uploadedBytes }, { status: 201 });
  } catch (error) {
    await rm(path, { force: true }).catch(() => undefined);
    if (error instanceof Error && error.message === "FILE_TOO_LARGE") return Response.json({ error: "Files cannot exceed 2 GB." }, { status: 413 });
    if (error instanceof Error && "code" in error && error.code === "EEXIST") return Response.json({ error: "This upload was already received. Refresh the library." }, { status: 409 });
    return Response.json({ error: "The upload could not be saved on this server. Check available disk space and retry." }, { status: 507 });
  }
}
