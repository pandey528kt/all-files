import "server-only";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/lib/schema";

const globalForDb = globalThis as typeof globalThis & { folioDbPool?: Pool };
const pool = globalForDb.folioDbPool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
if (process.env.NODE_ENV !== "production") globalForDb.folioDbPool = pool;

export const db = drizzle(pool, { schema });
