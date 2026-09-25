import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { Control } from "../../../types";
import type { SessionDefinition } from "../session/sessionDefinition";
import { sql } from "drizzle-orm";

const controls = [
  "running",
  "step",
  "pause",
  "cancel",
  "pause_cancel",
] as const satisfies readonly Control[];
export const sessions = sqliteTable(
  "sessions",
  {
    control: text({ enum: controls }).notNull(),
    createdAt: integer("created_at").notNull(),
    definition: text("definition_json", { mode: "json" }).$type<SessionDefinition>().notNull(),
    id: text().primaryKey(),
    profiles: text("profiles_json", { mode: "json" }).$type<string[]>().notNull(),
    transcriptRevision: integer("transcript_revision").notNull().default(0),
    updatedAt: integer("updated_at").notNull(),
    workspace: text().notNull(),
  },
  (table) => [
    check(
      "sessions_control",
      sql`${table.control} in ('running', 'step', 'pause', 'cancel', 'pause_cancel')`,
    ),
  ],
);
export const composerDrafts = sqliteTable("composer_drafts", {
  content: text().notNull(),
  revision: integer().notNull(),
  sessionId: text("session_id")
    .primaryKey()
    .references(() => sessions.id, { onDelete: "cascade" }),
  updatedAt: integer("updated_at").notNull(),
});
export const hookUsage = sqliteTable(
  "hook_usage",
  {
    hookId: text("hook_id").notNull(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    usedCount: integer("used_count").notNull(),
  },
  (table) => [uniqueIndex("hook_usage_identity").on(table.sessionId, table.hookId)],
);
