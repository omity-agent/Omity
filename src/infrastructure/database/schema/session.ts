import {
  type AnySQLiteColumn,
  blob,
  check,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { Control, QueueStatus } from "../../../types";
import type { ErrorDetails } from "../../../failures/details";
import { sql } from "drizzle-orm";

const controls = [
  "running",
  "step",
  "pause",
  "cancel",
  "pause_cancel",
] as const satisfies readonly Control[];
const queueStatuses = [
  "draft",
  "pending",
  "running",
  "paused",
  "done",
  "canceled",
] as const satisfies readonly QueueStatus[];
export const sessions = sqliteTable(
  "sessions",
  {
    control: text({ enum: controls }).notNull(),
    createdAt: integer("created_at").notNull(),
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
export const queue = sqliteTable(
  "queue",
  {
    content: text(),
    error: text({ mode: "json" }).$type<ErrorDetails>(),
    id: integer().primaryKey({ autoIncrement: true }),
    rootId: integer("root_id").references((): AnySQLiteColumn => queue.id),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    status: text({ enum: queueStatuses }).notNull(),
  },
  (table) => [
    check(
      "queue_status",
      sql`${table.status} in ('draft', 'pending', 'running', 'paused', 'done', 'canceled')`,
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
export const hostLeases = sqliteTable("host_leases", {
  expiresAt: integer("expires_at").notNull(),
  ownerId: text("owner_id").notNull(),
  sessionId: text("session_id")
    .primaryKey()
    .references(() => sessions.id, { onDelete: "cascade" }),
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
export const toolCancellations = sqliteTable(
  "tool_cancellations",
  {
    callId: text("call_id").notNull(),
    requestedAt: integer("requested_at").notNull(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("tool_cancellations_identity").on(table.sessionId, table.callId)],
);
export const checkpoints = sqliteTable(
  "checkpoints",
  {
    checkpoint: blob({ mode: "buffer" }).notNull(),
    checkpointId: text("checkpoint_id").notNull(),
    checkpointNs: text("checkpoint_ns").notNull(),
    metadata: blob({ mode: "buffer" }).notNull(),
    threadId: text("thread_id").notNull(),
    type: text().notNull(),
  },
  (table) => [uniqueIndex("checkpoints_identity").on(table.threadId, table.checkpointNs)],
);
export const checkpointWrites = sqliteTable(
  "checkpoint_writes",
  {
    channel: text().notNull(),
    checkpointId: text("checkpoint_id").notNull(),
    checkpointNs: text("checkpoint_ns").notNull(),
    index: integer("write_index").notNull(),
    taskId: text("task_id").notNull(),
    threadId: text("thread_id").notNull(),
    type: text().notNull(),
    value: blob({ mode: "buffer" }).notNull(),
  },
  (table) => [
    uniqueIndex("checkpoint_writes_identity").on(
      table.threadId,
      table.checkpointNs,
      table.checkpointId,
      table.taskId,
      table.index,
    ),
  ],
);
