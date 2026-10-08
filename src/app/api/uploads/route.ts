import { z } from "zod";
import { pendingFilePath } from "@/lib/shared-store";

const maxFileSize = 2 * 1024 * 1024 * 1024;
const schema = z.object({ name: z.string().trim().min(1).max(255), size: z.number().int().positive().max(maxFileSize), contentType: z.string().max(255), folderId: z.string().uuid().nullable() });

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Send valid file details." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Files must be non-empty and no larger than 2 GB." }, { status: 400 });
  const id = crypto.randomUUID();
  try {
    pendingFilePath(id);
    return Response.json({ id, uploadUrl: `/api/uploads/${id}/content`, ...parsed.data }, { status: 201 });
  } catch { return Response.json({ error: "Could not prepare this upload." }, { status: 500 }); }
}
