import type { CheckpointListOptions } from "@langchain/langgraph-checkpoint";
import type { RunnableConfig } from "@langchain/core/runnables";
import { localize } from "../i18n/server";

export function checkpointRunId(value: unknown) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw new Error(localize("checkpoint:identity.threadIdMustBeRunId"));
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id)) {
    throw new Error(localize("checkpoint:identity.runIdUnsafe"));
  }
  return id;
}
function optionalString(value: unknown, name: string) {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(localize("checkpoint:identity.fieldMustBeString", { value0: name }));
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
    throw new Error(localize("checkpoint:identity.historyQueryUnsupported"));
  }
  return {
    checkpointNs,
    limit: options?.limit,
    runId: threadId ? checkpointRunId(threadId) : undefined,
  };
}
