import { z } from "zod";
import { hashSecret, issueAccessToken, readCatalog, updateCatalog, verifySecret } from "@/lib/shared-store";

const schema = z.object({ passwords: z.record(z.string(), z.string()).default({}), recoveryCode: z.string().optional(), newPassword: z.string().min(4).max(200).optional() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Send a valid access request." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Password details are invalid." }, { status: 400 });
  try {
    const catalog = await readCatalog();
    const file = catalog.files.find((entry) => entry.id === id);
    if (!file) return Response.json({ error: "File not found." }, { status: 404 });
    const chain = [];
    let folder = catalog.folders.find((entry) => entry.id === file.folderId);
    while (folder) { chain.unshift(folder); folder = catalog.folders.find((entry) => entry.id === folder?.parentId); }
    const locked = [...chain.map((item) => ({ ...item, kind: "folder" as const })), { ...file, kind: "file" as const }];
    for (const item of locked) {
      if (!item.passwordHash) continue;
      if (await verifySecret(parsed.data.passwords[item.id] ?? "", item.passwordHash)) continue;
      if (parsed.data.recoveryCode && item.recoveryHash && parsed.data.newPassword && await verifySecret(parsed.data.recoveryCode, item.recoveryHash)) {
        await updateCatalog(async (current) => {
          const target = item.kind === "file" ? current.files.find((entry) => entry.id === item.id) : current.folders.find((entry) => entry.id === item.id);
          if (target) target.passwordHash = await hashSecret(parsed.data.newPassword!);
        });
        return Response.json({ error: "Password reset. Enter the new password to continue." }, { status: 401 });
      }
      return Response.json({ error: "Enter the password to access this file.", lockedId: item.id, label: item.name, kind: item.kind }, { status: 401 });
    }
    const token = issueAccessToken(file.id);
    return Response.json({ url: `/api/files/${file.id}/download?token=${encodeURIComponent(token)}` });
  } catch { return Response.json({ error: "Could not verify file access. Try again." }, { status: 503 }); }
}
