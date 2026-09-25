import type { CheckpointListOptions } from "@langchain/langgraph-checkpoint";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { SQLQueryBindings } from "bun:sqlite";

export interface CheckpointRow {
  checkpoint: Uint8Array;
  checkpoint_id: string;
  checkpoint_ns: string;
  metadata: Uint8Array;
  pending_writes: string;
  run_id: number;
  type: string;
}
export interface WriteRow {
  channel: string;
  task_id: string;
  type: string;
  value: string;
}
export function checkpointRunId(value: unknown) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw new Error("thread_id 必须是执行轮次 ID");
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id)) {
    throw new Error("执行轮次 ID 超出安全整数范围");
  }
  return id;
}
function optionalString(value: unknown, name: string) {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${name} 必须是字符串`);
  }
  return value;
}
export function configIdentity(config: RunnableConfig) {
  return {
    checkpointId: optionalString(config.configurable?.["checkpoint_id"], "checkpoint_id"),
    checkpointNs: optionalString(config.configurable?.["checkpoint_ns"], "checkpoint_ns") ?? "",
    runId: checkpointRunId(config.configurable?.["thread_id"]),
  };
}
export function selectCheckpoint() {
  return `SELECT run_id, checkpoint_ns, checkpoint_id, type, checkpoint, metadata,
    (SELECT json_group_array(json_object(
      'task_id', task_id, 'channel', channel, 'type', type,
      'value', CAST(value AS TEXT)
    )) FROM (
      SELECT task_id, channel, type, value FROM checkpoint_writes
      WHERE run_id = checkpoints.run_id
        AND checkpoint_ns = checkpoints.checkpoint_ns
        AND checkpoint_id = checkpoints.checkpoint_id
      ORDER BY task_id, write_index
    )) AS pending_writes
    FROM checkpoints WHERE run_id = ? AND checkpoint_ns = ?`;
}
export function listQuery(config: RunnableConfig, options?: CheckpointListOptions) {
  const clauses: string[] = [],
    args: SQLQueryBindings[] = [],
    threadId = optionalString(config.configurable?.["thread_id"], "thread_id"),
    checkpointNs = optionalString(config.configurable?.["checkpoint_ns"], "checkpoint_ns");
  if (threadId) {
    clauses.push("run_id = ?");
    args.push(checkpointRunId(threadId));
  }
  if (checkpointNs !== undefined) {
    clauses.push("checkpoint_ns = ?");
    args.push(checkpointNs);
  }
  if (options?.before || options?.filter) {
    throw new Error("当前恢复存储不支持历史 checkpoint 查询");
  }
  let sql = selectCheckpoint().replace(
    " WHERE run_id = ? AND checkpoint_ns = ?",
    clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "",
  );
  if (options?.limit !== undefined) {
    sql += " LIMIT ?";
    args.push(options.limit);
  }
  return { args, sql };
}
