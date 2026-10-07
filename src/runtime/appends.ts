import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import type { ActiveRun } from "./run";
import type { HostContext } from "./context";
import { inputMessageId } from "../infrastructure/database/records/transcript/messages/history";
import { localize } from "../i18n/server";

export function consumeBoundaryAppends(ctx: HostContext, run: ActiveRun, state: BoundaryState) {
  if (hasPendingTools(state) || blocksAppend(state.values?.hookPlan)) {
    return null;
  }
  const appends = ctx.db.pendingInputs(ctx.sessionId);
  if (appends.length === 0) {
    return null;
  }
  for (const item of appends) {
    const userMessageId = ctx.db.consumeInput(ctx.sessionId, item);
    run.items.push({ ...item, status: "running", userMessageId });
  }
  ctx.logger.info(localize("runtime:append.inputAddedAtBoundary"), {
    inputIds: appends.map((item) => item.id),
  });
  return {
    hookPendingUserIds: [
      ...pendingUserIds(state),
      ...appends.map((item) => inputMessageId(ctx.sessionId, item.id)),
    ],
    messages: appends.map(
      (item) =>
        new HumanMessage({
          content: item.content,
          id: inputMessageId(ctx.sessionId, item.id),
        }),
    ),
  };
}
export function recoverConsumedAppends(ctx: HostContext, run: ActiveRun, state: BoundaryState) {
  const consumedIds = new Set(run.items.map((item) => inputMessageId(ctx.sessionId, item.id)));
  for (const message of state.values?.messages ?? []) {
    if (HumanMessage.isInstance(message) && message.id) {
      consumedIds.delete(message.id);
    }
  }
  if (consumedIds.size === 0) {
    return null;
  }
  const messages = ctx.db
      .history(ctx.sessionId)
      .filter(
        (message) =>
          HumanMessage.isInstance(message) &&
          message.id !== undefined &&
          consumedIds.has(message.id),
      ),
    recoveredIds = new Set(messages.map((message) => message.id)),
    absentIds = [...consumedIds].filter((id) => !recoveredIds.has(id));
  if (absentIds.length > 0) {
    throw new Error(
      localize("runtime:append.userMessageMissing", { value0: absentIds.join(", ") }),
    );
  }
  ctx.logger.warn(localize("runtime:append.uncommittedAfterCheckpointResume"), {
    inputIds: run.items
      .filter((item) => consumedIds.has(inputMessageId(ctx.sessionId, item.id)))
      .map((item) => item.id),
  });
  return {
    hookPendingUserIds: [...new Set([...pendingUserIds(state), ...consumedIds])],
    messages,
  };
}
interface BoundaryState {
  values?: {
    messages?: unknown[];
    hookPlan?: unknown;
    hookPendingUserIds?: unknown;
  };
}
function blocksAppend(plan: unknown) {
  return (
    plan !== null &&
    plan !== undefined &&
    (!isRecord(plan) || plan["kind"] !== "agent" || plan["when"] !== "after")
  );
}
function pendingUserIds(state: BoundaryState) {
  const value = state.values?.hookPendingUserIds;
  return Array.isArray(value) && value.every((id) => typeof id === "string") ? value : [];
}
function hasPendingTools(state: BoundaryState) {
  const messages = state.values?.messages;
  if (!Array.isArray(messages)) {
    return false;
  }
  const toolIds = new Set(
      messages
        .filter((message) => ToolMessage.isInstance(message))
        .map((message) => message.tool_call_id),
    ),
    lastAi = messages.findLast((message) => AIMessage.isInstance(message));
  return Boolean(lastAi?.tool_calls?.some((call) => !call.id || !toolIds.has(call.id)));
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
