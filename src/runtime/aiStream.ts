import { AIMessage, type BaseMessage, ToolMessage } from "@langchain/core/messages";
import { acceptMessageId, sequentialPart, toolPart } from "./stream/parts";
import type { AiStreamEvent } from "../agent/aiAgent";
import type { HostContext } from "./context";
import type { StreamLogState } from "./stream";
import { findToolStreamIdentity } from "../infrastructure/database/records/toolStreamIdentity";
import { toUIMessageChunk } from "ai";

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
  const chunk = toUIMessageChunk(event.part);
  if (chunk?.type === "text-delta" || chunk?.type === "reasoning-delta") {
    const kind = chunk.type === "text-delta" ? "assistant_text_delta" : "assistant_reasoning_delta";
    const messageId = streamMessageId(state, chunk.id);
    ctx.db.appendStream(ctx.sessionId, {
      kind,
      messageId,
      partId: sequentialPart(state.parts, kind),
      queueId,
      value: chunk.delta,
    });
    if (chunk.type === "text-delta") {
      if (ctx.settings.logging.streamTokens) {
        ctx.logger.token(chunk.delta);
      }
      ctx.observer?.token(ctx.sessionId, queueId, chunk.delta);
    }
  } else if (chunk?.type === "tool-input-start") {
    ctx.toolExecutions?.announce(chunk.toolCallId);
    const messageId = streamMessageId(state, chunk.toolCallId);
    const index = toolIndex(state, chunk.toolCallId);
    ctx.db.appendStream(ctx.sessionId, {
      kind: "tool_call_delta",
      messageId,
      partId: toolPart(state.parts, index),
      queueId,
      value: {
        ...(event.freeform ? { freeform: true } : {}),
        idDelta: chunk.toolCallId,
        index,
        nameDelta: chunk.toolName,
      },
    });
  } else if (chunk?.type === "tool-input-delta") {
    const messageId = streamMessageId(state, chunk.toolCallId);
    const index = toolIndex(state, chunk.toolCallId);
    ctx.db.appendStream(ctx.sessionId, {
      kind: "tool_call_delta",
      messageId,
      partId: toolPart(state.parts, index),
      queueId,
      value: { argumentsDelta: chunk.inputTextDelta, index },
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
