import {
  blob,
  foreignKey,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { runs } from "./execution";

export const checkpoints = sqliteTable(
  "checkpoints",
  {
    checkpoint: blob({ mode: "buffer" }).notNull(),
    checkpointId: text("checkpoint_id").notNull(),
    checkpointNs: text("checkpoint_ns").notNull(),
    metadata: blob({ mode: "buffer" }).notNull(),
    runId: integer("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    type: text().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.checkpointNs] }),
    uniqueIndex("checkpoints_snapshot").on(table.runId, table.checkpointNs, table.checkpointId),
  ],
);
export const checkpointWrites = sqliteTable(
  "checkpoint_writes",
  {
    channel: text().notNull(),
    checkpointId: text("checkpoint_id").notNull(),
    checkpointNs: text("checkpoint_ns").notNull(),
    index: integer("write_index").notNull(),
    runId: integer("run_id").notNull(),
    taskId: text("task_id").notNull(),
    type: text().notNull(),
    value: blob({ mode: "buffer" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.checkpointNs, table.taskId, table.index] }),
    foreignKey({
      columns: [table.runId, table.checkpointNs, table.checkpointId],
      foreignColumns: [checkpoints.runId, checkpoints.checkpointNs, checkpoints.checkpointId],
    }).onDelete("cascade"),
  ],
);
