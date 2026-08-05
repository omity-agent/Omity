import { AIMessage, type BaseMessage, ToolMessage } from "@langchain/core/messages";
import { acceptMessageId, sequentialPart, toolPart } from "./stream/parts";
import type { AiStreamEvent } from "../agent/aiAgent";
import type { HostContext } from "./context";
import type { StreamLogState } from "./stream";
import { findToolStreamIdentity } from "../infrastructure/database/records/toolStreamIdentity";

type AiStreamContext = Pick<
  HostContext,
  "db" | "logger" | "observer" | "sessionId" | "settings" | "toolExecutions"
>;
export function recordAiStreamPart(
  ctx: AiStreamContext,
  queueId: number,
  event: AiStreamEvent,
  state: StreamLogState,
) {
  const { part } = event;
  if (part.type === "text-delta" || part.type === "reasoning-delta") {
    const kind = part.type === "text-delta" ? "assistant_text_delta" : "assistant_reasoning_delta";
    const messageId = streamMessageId(state, part.id);
    ctx.db.appendStream(ctx.sessionId, {
      kind,
      messageId,
      partId: sequentialPart(state.parts, kind),
      queueId,
      value: part.text,
    });
    if (part.type === "text-delta") {
      if (ctx.settings.logging.streamTokens) {
        ctx.logger.token(part.text);
      }
      ctx.observer?.token(ctx.sessionId, queueId, part.text);
    }
  } else if (part.type === "tool-input-start") {
    ctx.toolExecutions?.announce(part.id);
    const messageId = streamMessageId(state, part.id);
    const index = toolIndex(state, part.id);
    ctx.db.appendStream(ctx.sessionId, {
      kind: "tool_call_delta",
      messageId,
      partId: toolPart(state.parts, index),
      queueId,
      value: {
        ...(event.freeform ? { freeform: true } : {}),
        idDelta: part.id,
        index,
        nameDelta: part.toolName,
      },
    });
  } else if (part.type === "tool-input-delta") {
    const messageId = streamMessageId(state, part.id);
    const index = toolIndex(state, part.id);
    ctx.db.appendStream(ctx.sessionId, {
      kind: "tool_call_delta",
      messageId,
      partId: toolPart(state.parts, index),
      queueId,
      value: { argumentsDelta: part.delta, index },
    });
  }
}
export function recordToolStarted(ctx: AiStreamContext, messages: BaseMessage[], queueId: number) {
  const completed = new Set(
    messages
      .filter((message) => ToolMessage.isInstance(message))
      .map((message) => message.tool_call_id),
  );
  const call = messages
    .findLast((message) => AIMessage.isInstance(message))
    ?.tool_calls?.find((candidate) => !candidate.id || !completed.has(candidate.id));
  if (!call?.id) {
    throw new Error("工具执行缺少稳定的调用 ID");
  }
  ctx.toolExecutions?.announce(call.id);
  const identity = findToolStreamIdentity(ctx.db.db, ctx.sessionId, call.id) ?? {
    messageId: call.id,
    partId: call.id,
  };
  ctx.db.appendStream(ctx.sessionId, {
    kind: "tool_started",
    messageId: identity.messageId,
    partId: identity.partId,
    queueId,
    value: call.id,
  });
}
function streamMessageId(state: StreamLogState, partId: string) {
  const messageId = acceptMessageId(state.parts, state.parts.messageId ?? partId);
  if (!messageId) {
    throw new Error("AI SDK 流缺少稳定消息 ID");
  }
  return messageId;
}
function toolIndex(state: StreamLogState, callId: string) {
  const existing = state.aiToolIndexes.get(callId);
  if (existing !== undefined) {
    return existing;
  }
  const index = state.aiToolIndexes.size;
  state.aiToolIndexes.set(callId, index);
  return index;
}
