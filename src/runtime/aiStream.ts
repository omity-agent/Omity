import { acceptMessageId, sequentialPart, toolPart } from "./stream/parts";
import { appendReasoningDelta, flushReasoning } from "./content";
import type { AiStreamEvent } from "../agent/aiAgent";
import type { BaseMessage } from "@langchain/core/messages";
import type { HostContext } from "./context";
import type { StreamLogState } from "./stream";
import { findToolStreamIdentity } from "../infrastructure/database/records/toolStreamIdentity";
import { pendingToolBatch } from "../agent/graph/toolBatch";
import { toUIMessageChunk } from "ai";

type AiStreamContext = Pick<
  HostContext,
  "db" | "logger" | "observer" | "sessionId" | "settings" | "toolExecutions"
>;
export async function recordAiStreamPart(
  ctx: AiStreamContext,
  queueId: number,
  event: AiStreamEvent,
  state: StreamLogState,
) {
  const chunk = toUIMessageChunk(event.part);
  if (chunk?.type === "reasoning-end") {
    const value = flushReasoning(state.parts.reasoning);
    if (!value) {
      return;
    }
    const messageId = streamMessageId(state, chunk.id);
    await ctx.db.appendStream(ctx.sessionId, {
      kind: "assistant_reasoning_delta",
      messageId,
      partId: sequentialPart(state.parts, "assistant_reasoning_delta"),
      queueId,
      value,
    });
    return;
  }
  if (chunk?.type === "text-delta" || chunk?.type === "reasoning-delta") {
    const kind = chunk.type === "text-delta" ? "assistant_text_delta" : "assistant_reasoning_delta";
    const messageId = streamMessageId(state, chunk.id);
    const value =
      chunk.type === "reasoning-delta"
        ? appendReasoningDelta(chunk.id, chunk.delta, state.parts.reasoning)
        : chunk.delta;
    await ctx.db.appendStream(ctx.sessionId, {
      kind,
      messageId,
      partId: sequentialPart(state.parts, kind),
      queueId,
      value,
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
    await ctx.db.appendStream(ctx.sessionId, {
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
    await ctx.db.appendStream(ctx.sessionId, {
      kind: "tool_call_delta",
      messageId,
      partId: toolPart(state.parts, index),
      queueId,
      value: { argumentsDelta: chunk.inputTextDelta, index },
    });
  }
}
export async function recordToolStarted(
  ctx: AiStreamContext,
  messages: BaseMessage[],
  queueId: number,
) {
  const calls = pendingToolBatch(messages, ctx.settings.toolExecution.parallel);
  for (const call of calls) {
    const callId = call.id,
      identity = findToolStreamIdentity(ctx.db.db, ctx.sessionId, callId) ?? {
        messageId: callId,
        partId: callId,
      };
    ctx.toolExecutions?.announce(callId);
    await ctx.db.appendStream(ctx.sessionId, {
      kind: "tool_started",
      messageId: identity.messageId,
      partId: identity.partId,
      queueId,
      value: callId,
    });
  }
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
