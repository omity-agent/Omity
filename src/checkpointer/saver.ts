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
  checkpointRunId,
  configIdentity,
  listQuery,
  selectCheckpoint,
} from "./sql";
import type { Database, SQLQueryBindings } from "bun:sqlite";
import { cachedQuery, queryAll, runTransaction } from "../infrastructure/database/sqlite/connection";
import { CheckpointDecoder } from "./decoding";
import type { RunnableConfig } from "@langchain/core/runnables";

export class BunSqliteSaver extends BaseCheckpointSaver {
  private readonly decoder = new CheckpointDecoder();
  constructor(readonly db: Database) {
    super();
  }
  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const { checkpointId, checkpointNs, runId } = configIdentity(config),
      row = cachedQuery<CheckpointRow>(this.db, selectCheckpoint()).get(runId, checkpointNs);
    if (!row) {
      return undefined;
    }
    if (checkpointId !== undefined && checkpointId !== row.checkpoint_id) {
      throw new Error(`历史 checkpoint 不可用：${checkpointId}`);
    }
    return this.decoder.decode(row, this.serde);
  }
  async *list(
    config: RunnableConfig,
    options?: CheckpointListOptions,
  ): AsyncGenerator<CheckpointTuple> {
    const { args, sql } = listQuery(config, options);
    for (const row of queryAll<CheckpointRow>(this.db, sql, ...args)) {
      yield await this.decoder.decode(row, this.serde);
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
      const current = cachedQuery<{ checkpoint_id: string }>(
        this.db,
        "SELECT checkpoint_id FROM checkpoints WHERE run_id = ? AND checkpoint_ns = ?",
      ).get(identity.runId, identity.checkpointNs);
      if (current && current.checkpoint_id !== identity.checkpointId) {
        throw new Error(`checkpoint head 冲突：${current.checkpoint_id}`);
      }
      this.db.run(
        `DELETE FROM checkpoint_writes
         WHERE run_id = ? AND checkpoint_ns = ? AND checkpoint_id <> ?`,
        [identity.runId, identity.checkpointNs, checkpoint.id],
      );
      this.db.run(
        `INSERT INTO checkpoints
          (run_id, checkpoint_ns, checkpoint_id, type, checkpoint, metadata)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(run_id, checkpoint_ns) DO UPDATE SET
          checkpoint_id = excluded.checkpoint_id, type = excluded.type,
          checkpoint = excluded.checkpoint, metadata = excluded.metadata`,
        [identity.runId, identity.checkpointNs, checkpoint.id, type, value, metadataValue],
      );
    });
    return {
      configurable: {
        checkpoint_id: checkpoint.id,
        checkpoint_ns: identity.checkpointNs,
        thread_id: identity.runId.toString(),
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
              identity.runId,
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
      const current = cachedQuery<{ checkpoint_id: string }>(
        this.db,
        "SELECT checkpoint_id FROM checkpoints WHERE run_id = ? AND checkpoint_ns = ?",
      ).get(identity.runId, identity.checkpointNs);
      if (current?.checkpoint_id !== checkpointId) {
        throw new Error(`checkpoint pending write 已过期：${checkpointId}`);
      }
      for (const row of rows) {
        this.db.run(
          `INSERT OR ${row.replace ? "REPLACE" : "IGNORE"} INTO checkpoint_writes
           (run_id, checkpoint_ns, checkpoint_id, task_id, write_index,
            channel, type, value) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          row.bindings,
        );
      }
    });
  }
  async deleteThread(threadId: string) {
    this.db.query("DELETE FROM checkpoints WHERE run_id = ?").run(checkpointRunId(threadId));
  }
}
