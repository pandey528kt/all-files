import { and, eq, isNull } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { db } from "@/lib/db";
import { folders } from "@/lib/schema";

const createFolderSchema = createInsertSchema(folders).pick({ name: true, parentId: true }).extend({
  name: z.string().trim().min(1).max(160),
  parentId: z.string().uuid().nullable().optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Send a valid JSON folder request." }, { status: 400 }); }
  const parsed = createFolderSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Enter a folder name under 160 characters." }, { status: 400 });
  try {
    const parentId = parsed.data.parentId ?? null;
    if (parentId && !(await db.query.folders.findFirst({ where: eq(folders.id, parentId), columns: { id: true } }))) return Response.json({ error: "The parent folder does not exist." }, { status: 404 });
    const duplicateCondition = parentId ? and(eq(folders.name, parsed.data.name), eq(folders.parentId, parentId)) : and(eq(folders.name, parsed.data.name), isNull(folders.parentId));
    const duplicate = await db.query.folders.findFirst({ where: duplicateCondition, columns: { id: true } });
    if (duplicate) return Response.json({ error: "A folder with that name already exists here." }, { status: 409 });
    const [created] = await db.insert(folders).values({ id: crypto.randomUUID(), name: parsed.data.name, parentId }).returning({ id: folders.id, name: folders.name, parentId: folders.parentId, createdAt: folders.createdAt });
    return Response.json(created, { status: 201 });
  } catch { return Response.json({ error: "Could not create that folder. Try again." }, { status: 503 }); }
}
