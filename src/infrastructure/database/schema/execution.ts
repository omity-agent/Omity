import {
  check,
  foreignKey,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { ErrorDetails } from "../../../failures/details";
import type { RunStatus } from "../../../types";
import { sessions } from "./session";
import { sql } from "drizzle-orm";

const statuses = [
  "pending",
  "running",
  "paused",
  "done",
  "canceled",
] as const satisfies readonly RunStatus[];
export const runs = sqliteTable(
  "runs",
  {
    error: text("error_json", { mode: "json" }).$type<ErrorDetails>(),
    id: integer().primaryKey({ autoIncrement: true }),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    status: text({ enum: statuses }).notNull(),
  },
  (table) => [
    check(
      "runs_status",
      sql`${table.status} in ('pending', 'running', 'paused', 'done', 'canceled')`,
    ),
    uniqueIndex("runs_owner").on(table.sessionId, table.id),
    uniqueIndex("runs_active_session")
      .on(table.sessionId)
      .where(sql`${table.status} in ('pending', 'running', 'paused')`),
  ],
);
export const inputs = sqliteTable(
  "inputs",
  {
    content: text().notNull(),
    delivery: text({ enum: ["pending", "consumed", "canceled"] })
      .notNull()
      .default("pending"),
    id: integer().primaryKey({ autoIncrement: true }),
    ordinal: integer().notNull(),
    runId: integer("run_id").notNull(),
    sessionId: text("session_id").notNull(),
    submissionId: text("submission_id"),
  },
  (table) => [
    check("inputs_delivery", sql`${table.delivery} in ('pending', 'consumed', 'canceled')`),
    check("inputs_ordinal", sql`${table.ordinal} >= 0`),
    foreignKey({
      columns: [table.sessionId, table.runId],
      foreignColumns: [runs.sessionId, runs.id],
    }).onDelete("cascade"),
    uniqueIndex("inputs_owner").on(table.sessionId, table.id),
    uniqueIndex("inputs_order").on(table.runId, table.ordinal),
    uniqueIndex("inputs_submission").on(table.sessionId, table.submissionId),
  ],
);
export const hostLeases = sqliteTable("host_leases", {
  expiresAt: integer("expires_at").notNull(),
  ownerId: text("owner_id").notNull(),
  sessionId: text("session_id")
    .primaryKey()
    .references(() => sessions.id, { onDelete: "cascade" }),
});
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
