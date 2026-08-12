import type { StreamEventKind, StreamEventValues } from "../records/streamEvents";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { queue, sessions } from "./session";
import type { FileLinkUnit } from "../../../fileLinks/types";
import type { StoredConversationMessage } from "../records/messages/payload";
import { sql } from "drizzle-orm";

const streamEventKinds = [
  "assistant_reasoning_delta",
  "assistant_text_delta",
  "tool_call_delta",
  "tool_finished",
  "tool_started",
  "user_appended",
] as const satisfies readonly StreamEventKind[];
export const messages = sqliteTable(
  "messages",
  {
    createdAt: integer("created_at").notNull(),
    id: integer().primaryKey({ autoIncrement: true }),
    message: text("message_json", { mode: "json" }).$type<StoredConversationMessage>().notNull(),
    position: integer(),
    queueId: integer("queue_id").references(() => queue.id),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    sourceId: text("source_id").notNull(),
  },
  (table) => [
    uniqueIndex("messages_source").on(table.sessionId, table.sourceId),
    uniqueIndex("messages_position").on(table.sessionId, table.position),
    uniqueIndex("messages_queue").on(table.queueId),
  ],
);
export const reasoningTranslations = sqliteTable(
  "reasoning_translations",
  {
    messageId: text("message_id").notNull(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    source: text().notNull(),
    targetLanguage: text("target_language").notNull(),
    translated: text().notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("reasoning_translations_identity").on(
      table.sessionId,
      table.messageId,
      table.targetLanguage,
    ),
  ],
);
export const events = sqliteTable(
  "events",
  {
    fileLinks: text("file_links_json", { mode: "json" }).$type<FileLinkUnit[]>().notNull(),
    id: integer().primaryKey({ autoIncrement: true }),
    kind: text({ enum: streamEventKinds }).notNull(),
    messageId: text("message_id").notNull(),
    partId: text("part_id").notNull(),
    payload: text("payload_json", { mode: "json" }).$type<StreamEventValues[StreamEventKind]>(),
    queueId: integer("queue_id")
      .notNull()
      .references(() => queue.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
  },
  (table) => [
    check(
      "events_kind",
      sql`${table.kind} in ('assistant_reasoning_delta', 'assistant_text_delta', 'tool_call_delta', 'tool_finished', 'tool_started', 'user_appended')`,
    ),
    check(
      "events_payload",
      sql`(${table.kind} = 'user_appended' and ${table.payload} is null) or (${table.kind} <> 'user_appended' and ${table.payload} is not null)`,
    ),
  ],
);
