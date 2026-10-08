import { z } from "zod";
import { hashSecret, readCatalog, updateCatalog, verifySecret } from "@/lib/shared-store";

const schema = z.object({ password: z.string().optional(), recoveryCode: z.string().optional(), newPassword: z.string().min(4).optional() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Send a valid access request." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Password details are invalid." }, { status: 400 });
  const catalog = await readCatalog();
  const folder = catalog.folders.find((entry) => entry.id === id);
  if (!folder) return Response.json({ error: "Folder not found." }, { status: 404 });
  if (!folder.passwordHash || await verifySecret(parsed.data.password ?? "", folder.passwordHash)) return Response.json({ ok: true });
  if (parsed.data.recoveryCode && parsed.data.newPassword && folder.recoveryHash && await verifySecret(parsed.data.recoveryCode, folder.recoveryHash)) {
    await updateCatalog(async (current) => { const target = current.folders.find((entry) => entry.id === id); if (target) target.passwordHash = await hashSecret(parsed.data.newPassword!); });
    return Response.json({ error: "Password reset. Enter the new password to continue." }, { status: 401 });
  }
  return Response.json({ error: "That folder password is incorrect." }, { status: 401 });
}
