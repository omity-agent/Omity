import type { CheckpointListOptions } from "@langchain/langgraph-checkpoint";
import type { RunnableConfig } from "@langchain/core/runnables";

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
export function listIdentity(config: RunnableConfig, options?: CheckpointListOptions) {
  const threadId = optionalString(config.configurable?.["thread_id"], "thread_id"),
    checkpointNs = optionalString(config.configurable?.["checkpoint_ns"], "checkpoint_ns");
  if (options?.before || options?.filter) {
    throw new Error("当前恢复存储不支持历史 checkpoint 查询");
  }
  return {
    checkpointNs,
    limit: options?.limit,
    runId: threadId ? checkpointRunId(threadId) : undefined,
  };
}
