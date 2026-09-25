import type { FileLinkSurface, FilePathMatch } from "../../../fileLinks/types";
import { foreignKey, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { inputs } from "./execution";
import { sessions } from "./session";

const surfaces = [
  "content",
  "reasoning",
  "tool_input",
  "tool_output",
] as const satisfies readonly FileLinkSurface[];
export const fileLinkUnits = sqliteTable(
  "file_link_units",
  {
    end: integer().notNull(),
    id: integer().primaryKey({ autoIncrement: true }),
    inputId: integer("input_id"),
    matches: text("matches_json", { mode: "json" }).$type<FilePathMatch[]>().notNull(),
    nextOffset: integer("next_offset").notNull(),
    ownerId: text("owner_id").notNull(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    start: integer().notNull(),
    surface: text({ enum: surfaces }).notNull(),
    text: text().notNull(),
    unitIndex: integer("unit_index").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.sessionId, table.inputId],
      foreignColumns: [inputs.sessionId, inputs.id],
    }),
    uniqueIndex("file_link_unit_owner").on(
      table.sessionId,
      table.ownerId,
      table.surface,
      table.unitIndex,
    ),
  ],
);
