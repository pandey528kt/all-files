import { rm } from "node:fs/promises";
import { saveUpload, pendingFilePath } from "@/lib/shared-store";

export const runtime = "nodejs";
const limit = 2 * 1024 * 1024 * 1024;

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!request.body) return Response.json({ error: "The upload is empty." }, { status: 400 });
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > limit) return Response.json({ error: "Files cannot exceed 2 GB." }, { status: 413 });
  const path = pendingFilePath(id);
  try {
    const size = await saveUpload(id, request.body);
    return Response.json({ size }, { status: 201 });
  } catch (error) {
    await rm(path, { force: true }).catch(() => undefined);
    return Response.json({ error: error instanceof Error && error.message === "FILE_TOO_LARGE" ? "Files cannot exceed 2 GB." : "Upload could not be saved. Check available server disk space and retry." }, { status: error instanceof Error && error.message === "FILE_TOO_LARGE" ? 413 : 507 });
  }
}
