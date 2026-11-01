import { foreignKey, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

import type { FileLinkSurface, FilePathMatch } from "../../../fileLinks/types";
import { inputs } from "./execution";
import { sessions } from "./session";

const surfaces = [
  "content",
  "reasoning",
  "tool_input",
  "tool_output",
] as const satisfies readonly FileLinkSurface[];
export const fileLinkSets = sqliteTable(
  "file_link_sets",
  {
    inputId: integer("input_id"),
    matches: text("matches_json", { mode: "json" }).$type<FilePathMatch[]>().notNull(),
    ownerId: text("owner_id").notNull(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    surface: text({ enum: surfaces }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.sessionId, table.inputId],
      foreignColumns: [inputs.sessionId, inputs.id],
    }),
    primaryKey({ columns: [table.sessionId, table.ownerId, table.surface] }),
  ],
);
