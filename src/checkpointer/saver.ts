import {
  BaseCheckpointSaver,
  type Checkpoint,
  type CheckpointListOptions,
  type CheckpointMetadata,
  type CheckpointTuple,
  type PendingWrite,
  WRITES_IDX_MAP,
  copyCheckpoint,
} from "@langchain/langgraph-checkpoint";
import {
  type CheckpointRow,
  type WriteRow,
  configIdentity,
  listQuery,
  selectCheckpoint,
} from "./sql";
import type { Database, SQLQueryBindings } from "bun:sqlite";
import { queryAll, queryGet, runTransaction } from "../infrastructure/database/connection";
import type { RunnableConfig } from "@langchain/core/runnables";
import { deleteThreadData } from "./lifecycle";
import { z } from "zod";

export class BunSqliteSaver extends BaseCheckpointSaver {
  constructor(readonly db: Database) {
    super();
  }
  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const { checkpointId, checkpointNs, threadId } = configIdentity(config),
      row = queryGet<CheckpointRow>(this.db, selectCheckpoint(), threadId, checkpointNs);
    if (!row) {
      return undefined;
    }
    if (checkpointId !== undefined && checkpointId !== row.checkpoint_id) {
      throw new Error(`历史 checkpoint 不可用：${checkpointId}`);
    }
    return this.decode(row);
  }
  async *list(
    config: RunnableConfig,
    options?: CheckpointListOptions,
  ): AsyncGenerator<CheckpointTuple> {
    const { args, sql } = listQuery(config, options);
    for (const row of queryAll<CheckpointRow>(this.db, sql, ...args)) {
      yield await this.decode(row);
    }
  }
  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
  ): Promise<RunnableConfig> {
    const identity = configIdentity(config),
      [[type, value], [metadataType, metadataValue]] = await Promise.all([
        this.serde.dumpsTyped(copyCheckpoint(checkpoint)),
        this.serde.dumpsTyped(metadata),
      ]);
    if (type !== metadataType) {
      throw new Error("checkpoint 与 metadata 的序列化类型不一致");
    }
    runTransaction(this.db, () => {
      const current = queryGet<{ checkpoint_id: string }>(
        this.db,
        "SELECT checkpoint_id FROM checkpoints WHERE thread_id = ? AND checkpoint_ns = ?",
        identity.threadId,
        identity.checkpointNs,
      );
      if (current && current.checkpoint_id !== identity.checkpointId) {
        throw new Error(`checkpoint head 冲突：${current.checkpoint_id}`);
      }
      this.db.run(
        `DELETE FROM checkpoint_writes
         WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id <> ?`,
        [identity.threadId, identity.checkpointNs, checkpoint.id],
      );
      this.db.run(
        `INSERT INTO checkpoints
          (thread_id, checkpoint_ns, checkpoint_id, type, checkpoint, metadata)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(thread_id, checkpoint_ns) DO UPDATE SET
          checkpoint_id = excluded.checkpoint_id, type = excluded.type,
          checkpoint = excluded.checkpoint, metadata = excluded.metadata`,
        [identity.threadId, identity.checkpointNs, checkpoint.id, type, value, metadataValue],
      );
    });
    return {
      configurable: {
        checkpoint_id: checkpoint.id,
        checkpoint_ns: identity.checkpointNs,
        thread_id: identity.threadId,
      },
    };
  }
  async putWrites(config: RunnableConfig, writes: PendingWrite[], taskId: string) {
    const identity = configIdentity(config);
    if (!identity.checkpointId) {
      throw new Error("缺少 checkpoint_id");
    }
    const { checkpointId } = identity,
      rows = await Promise.all(
        writes.map(async ([channel, value], index) => {
          const [type, serialized] = await this.serde.dumpsTyped(value),
            bindings: SQLQueryBindings[] = [
              identity.threadId,
              identity.checkpointNs,
              checkpointId,
              taskId,
              WRITES_IDX_MAP[channel] ?? index,
              channel,
              type,
              serialized,
            ];
          return {
            bindings,
            replace: channel in WRITES_IDX_MAP,
          };
        }),
      );
    runTransaction(this.db, () => {
      const current = queryGet<{ checkpoint_id: string }>(
        this.db,
        "SELECT checkpoint_id FROM checkpoints WHERE thread_id = ? AND checkpoint_ns = ?",
        identity.threadId,
        identity.checkpointNs,
      );
      if (current?.checkpoint_id !== checkpointId) {
        throw new Error(`checkpoint pending write 已过期：${checkpointId}`);
      }
      for (const row of rows) {
        this.db.run(
          `INSERT OR ${row.replace ? "REPLACE" : "IGNORE"} INTO checkpoint_writes
           (thread_id, checkpoint_ns, checkpoint_id, task_id, write_index,
            channel, type, value) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          row.bindings,
        );
      }
    });
  }
  async deleteThread(threadId: string) {
    runTransaction(this.db, () => deleteThreadData(this.db, threadId));
  }
  private async decode(row: CheckpointRow): Promise<CheckpointTuple> {
    const pending = writeRowsSchema.parse(JSON.parse(row.pending_writes)),
      checkpoint = await this.serde.loadsTyped(row.type, row.checkpoint),
      metadata = await this.serde.loadsTyped(row.type, row.metadata),
      pendingWrites = await Promise.all(
        pending.map(async (write) => {
          const value = await this.serde.loadsTyped(write.type, write.value);
          return [write.task_id, write.channel, value] as [string, string, unknown];
        }),
      );
    return {
      checkpoint: requireCheckpoint(checkpoint),
      config: {
        configurable: {
          checkpoint_id: row.checkpoint_id,
          checkpoint_ns: row.checkpoint_ns,
          thread_id: row.thread_id,
        },
      },
      metadata: requireMetadata(metadata),
      pendingWrites,
    };
  }
}
function requireCheckpoint(value: unknown): Checkpoint {
  return checkpointSchema.parse(value);
}
function requireMetadata(value: unknown): CheckpointMetadata {
  return metadataSchema.parse(value);
}
const channelVersionSchema = z.union([z.number(), z.string()]),
  channelVersionsSchema = z.record(z.string(), channelVersionSchema),
  checkpointSchema: z.ZodType<Checkpoint> = z.looseObject({
    channel_values: z.record(z.string(), z.unknown()),
    channel_versions: channelVersionsSchema,
    id: z.string(),
    ts: z.string(),
    v: z.number(),
    versions_seen: z.record(z.string(), channelVersionsSchema),
  }),
  metadataSchema: z.ZodType<CheckpointMetadata> = z.looseObject({
    parents: z.record(z.string(), z.string()),
    source: z.enum(["input", "loop", "update", "fork"]),
    step: z.number(),
  }),
  writeRowsSchema: z.ZodType<WriteRow[]> = z.array(
    z.object({
      channel: z.string(),
      task_id: z.string(),
      type: z.string(),
      value: z.string(),
    }),
  );
