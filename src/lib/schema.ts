import { bigint, index, pgTable, text, timestamp, type AnyPgColumn } from "drizzle-orm/pg-core";

export const folders = pgTable("folders", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  parentId: text("parent_id").references((): AnyPgColumn => folders.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash"),
  recoveryCodeHash: text("recovery_code_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("folders_parent_id_idx").on(table.parentId)]);

export const files = pgTable("files", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  size: bigint("size", { mode: "number" }).notNull(),
  contentType: text("content_type").notNull(),
  objectKey: text("object_key").notNull().unique(),
  folderId: text("folder_id").references(() => folders.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash"),
  recoveryCodeHash: text("recovery_code_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("files_folder_id_idx").on(table.folderId), index("files_created_at_idx").on(table.createdAt)]);

export type Folder = typeof folders.$inferSelect;
export type NewFolder = typeof folders.$inferInsert;
export type SharedFile = typeof files.$inferSelect;
export type NewSharedFile = typeof files.$inferInsert;
