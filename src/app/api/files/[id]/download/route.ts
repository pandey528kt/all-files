import { GetObjectCommand } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@/lib/db";
import { files } from "@/lib/schema";
import { getStorage } from "@/lib/r2";
import { createReadStream } from "node:fs";
import { localObjectPath } from "@/lib/local-storage";
import { Readable } from "node:stream";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const file = await db.query.files.findFirst({ where: eq(files.id, id) });
    if (!file) return Response.json({ error: "File not found." }, { status: 404 });
    const download = new URL(request.url).searchParams.get("download") === "1";
    const disposition = download ? "attachment" : "inline";
    const contentDisposition = `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`;
    if (file.storageBackend === "r2") {
      const { client, bucket } = getStorage();
      const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: file.objectKey, ResponseContentDisposition: contentDisposition }), { expiresIn: 300 });
      return Response.redirect(url, 302);
    }
    const stream = createReadStream(localObjectPath(id));
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": contentDisposition,
        "Content-Length": String(file.size),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch {
    return Response.json({ error: "File storage is not configured yet. Add the R2 environment variables and retry." }, { status: 503 });
  }
}
