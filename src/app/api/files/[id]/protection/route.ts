import { z } from "zod";
import { hashSecret, newSecret, readCatalog, updateCatalog, verifySecret } from "@/lib/shared-store";

const schema = z.object({ ownerKey: z.string().min(20).max(128), password: z.string().min(4).max(200).nullable() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Send valid password settings." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Use a password of at least 4 characters, or remove it." }, { status: 400 });
  try {
    const catalog = await readCatalog();
    const item = catalog.files.find((file) => file.id === id);
    if (!item) return Response.json({ error: "File not found." }, { status: 404 });
    if (!(await verifySecret(parsed.data.ownerKey, item.ownerHash))) return Response.json({ error: "Only the uploader can change this file's password." }, { status: 403 });
    const recoveryCode = parsed.data.password ? newSecret() : null;
    await updateCatalog(async (current) => {
      const file = current.files.find((entry) => entry.id === id);
      if (file) {
        file.passwordHash = parsed.data.password ? await hashSecret(parsed.data.password) : null;
        file.recoveryHash = recoveryCode ? await hashSecret(recoveryCode) : null;
      }
    });
    return Response.json({ protected: Boolean(parsed.data.password), recoveryCode });
  } catch { return Response.json({ error: "Could not update password settings. Try again." }, { status: 503 }); }
}
