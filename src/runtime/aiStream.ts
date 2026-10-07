import { type AiStreamEvent, hasModelContent } from "../agent/model/request";
import { acceptMessageId, sequentialPart } from "./stream/parts";
import { appendReasoningDelta, flushReasoning } from "./content";
import type { BaseMessage } from "@langchain/core/messages";
import type { HostContext } from "./context";
import type { StreamLogState } from "./stream";
import { findToolStreamIdentity } from "../infrastructure/database/records/transcript/toolStreamIdentity";
import { localize } from "../i18n/server";
import { pendingToolBatch } from "../agent/graph/toolBatch";
import { recordInvocation } from "./stream/invocations";
import { toUIMessageChunk } from "ai";

type AiStreamContext = Pick<
  HostContext,
  "db" | "logger" | "observer" | "sessionId" | "settings" | "toolExecutions"
>;
export async function recordAiStreamPart(
  ctx: AiStreamContext,
  inputId: number,
  event: AiStreamEvent,
  state: StreamLogState,
) {
  if (!state.modelResponding && hasModelContent(event.part)) {
    state.modelResponding = true;
    ctx.observer?.activity?.(ctx.sessionId, "streaming");
  }
  const chunk = toUIMessageChunk(event.part);
  if (chunk?.type === "reasoning-end") {
    const value = flushReasoning(state.parts.reasoning);
    if (!value) {
      return;
    }
    const messageId = streamMessageId(state, chunk.id);
    await ctx.db.appendStream(ctx.sessionId, {
      inputId,
      kind: "assistant_reasoning_delta",
      messageId,
      partId: sequentialPart(state.parts, "assistant_reasoning_delta"),
      value,
    });
    return;
  }
  if (chunk?.type === "text-delta" || chunk?.type === "reasoning-delta") {
    const kind = chunk.type === "text-delta" ? "assistant_text_delta" : "assistant_reasoning_delta",
      messageId = streamMessageId(state, chunk.id),
      value =
        chunk.type === "reasoning-delta"
          ? appendReasoningDelta(chunk.id, chunk.delta, state.parts.reasoning)
          : chunk.delta;
    await ctx.db.appendStream(ctx.sessionId, {
      inputId,
      kind,
      messageId,
      partId: sequentialPart(state.parts, kind),
      value,
    });
    if (chunk.type === "text-delta") {
      if (ctx.settings.logging.streamTokens) {
        ctx.logger.token(chunk.delta);
      }
      ctx.observer?.token(ctx.sessionId, inputId, chunk.delta);
    }
  } else {
    await recordInvocation(ctx, inputId, event, state);
  }
}
export async function recordToolStarted(
  ctx: AiStreamContext,
  messages: BaseMessage[],
  inputId: number,
) {
  const calls = pendingToolBatch(messages, ctx.settings.toolExecution.parallel);
  for (const call of calls.filter(
    (pending) => ctx.db.toolCancellation(ctx.sessionId, pending.id) === undefined,
  )) {
    const callId = call.id,
      identity = findToolStreamIdentity(ctx.db.db, ctx.sessionId, callId) ?? {
        messageId: callId,
        partId: callId,
      };
    ctx.toolExecutions?.announce(callId);
    await ctx.db.appendStream(ctx.sessionId, {
      inputId,
      kind: "tool_started",
      messageId: identity.messageId,
      partId: identity.partId,
      value: callId,
    });
  }
}
function streamMessageId(state: StreamLogState, partId: string) {
  const messageId = acceptMessageId(state.parts, state.parts.messageId ?? partId);
  if (!messageId) {
    throw new Error(localize("runtime:stream.stableMessageIdMissing"));
  }
  return messageId;
}
