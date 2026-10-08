import { GetObjectCommand } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@/lib/db";
import { files } from "@/lib/schema";
import { getStorage } from "@/lib/r2";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const file = await db.query.files.findFirst({ where: eq(files.id, id) });
    if (!file) return Response.json({ error: "File not found." }, { status: 404 });
    const { client, bucket } = getStorage();
    const download = new URL(request.url).searchParams.get("download") === "1";
    const disposition = download ? "attachment" : "inline";
    const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: file.objectKey, ResponseContentDisposition: `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}` }), { expiresIn: 300 });
    return Response.redirect(url, 302);
  } catch {
    return Response.json({ error: "File storage is not configured yet. Add the R2 environment variables and retry." }, { status: 503 });
  }
}
