import { acceptMessageId, toolPart } from "./parts";
import { displayToolInput, textOutputSnapshot, toolOutputText, toolValueText } from "../toolOutput";
import type { AiStreamEvent } from "../../agent/model/request";
import type { HostContext } from "../context";
import type { StreamLogState } from "../stream";
import { captureError } from "../../failures/details";
import { findToolStreamIdentity } from "../../infrastructure/database/records/transcript/toolStreamIdentity";
import { localize } from "../../i18n/server";
import { toUIMessageChunk } from "ai";

type InvocationContext = Pick<HostContext, "db" | "sessionId" | "toolExecutions">;
export async function recordInvocation(
  ctx: InvocationContext,
  inputId: number,
  event: AiStreamEvent,
  state: StreamLogState,
) {
  const chunk = toUIMessageChunk(event.part);
  if (chunk?.type === "tool-input-start") {
    if (!chunk.providerExecuted) {
      ctx.toolExecutions?.announce(chunk.toolCallId);
    }
    const identity = invocationIdentity(state, chunk.toolCallId);
    await ctx.db.appendStream(ctx.sessionId, {
      inputId,
      kind: "tool_call_delta",
      messageId: identity.messageId,
      partId: identity.partId,
      value: {
        ...(event.freeform ? { freeform: true } : {}),
        idDelta: chunk.toolCallId,
        index: identity.index,
        nameDelta: chunk.toolName,
        ...(chunk.providerExecuted ? { providerExecuted: true } : {}),
      },
    });
  } else if (chunk?.type === "tool-input-delta") {
    const identity = invocationIdentity(state, chunk.toolCallId);
    await ctx.db.appendStream(ctx.sessionId, {
      inputId,
      kind: "tool_call_delta",
      messageId: identity.messageId,
      partId: identity.partId,
      value: { argumentsDelta: chunk.inputTextDelta, index: identity.index },
    });
  } else if (chunk?.type === "tool-input-available" && chunk.providerExecuted) {
    const identity = invocationIdentity(state, chunk.toolCallId);
    await ctx.db.appendStream(ctx.sessionId, {
      inputId,
      kind: "tool_call_delta",
      messageId: identity.messageId,
      partId: identity.partId,
      value: {
        argumentsText: toolValueText(displayToolInput(chunk.input)),
        index: identity.index,
        providerExecuted: true,
      },
    });
    await ctx.db.appendStream(ctx.sessionId, {
      inputId,
      kind: "tool_started",
      messageId: identity.messageId,
      partId: identity.partId,
      value: chunk.toolCallId,
    });
  } else if (
    (chunk?.type === "tool-output-available" || chunk?.type === "tool-output-error") &&
    chunk.providerExecuted
  ) {
    if (chunk.type === "tool-output-available" && chunk.preliminary) {
      return;
    }
    const identity = state.aiToolIndexes.has(chunk.toolCallId)
      ? invocationIdentity(state, chunk.toolCallId)
      : findToolStreamIdentity(ctx.db.db, ctx.sessionId, chunk.toolCallId);
    if (!identity) {
      throw new Error(
        localize("runtime:stream.toolResultCallMissing", { value0: chunk.toolCallId }),
      );
    }
    let content: string;
    if (chunk.type === "tool-output-error") {
      if (event.part.type !== "tool-error") {
        throw new Error(
          localize("runtime:stream.toolErrorEventInvalid", { value0: chunk.toolCallId }),
        );
      }
      content = toolOutputText(captureError(event.part.error));
    } else {
      content = toolOutputText(chunk.output);
    }
    await ctx.db.appendStream(ctx.sessionId, {
      inputId,
      kind: "tool_finished",
      messageId: identity.messageId,
      partId: identity.partId,
      value: { callId: chunk.toolCallId, output: textOutputSnapshot(content) },
    });
  }
}
function invocationIdentity(state: StreamLogState, callId: string) {
  const messageId = acceptMessageId(state.parts, state.parts.messageId ?? callId);
  if (!messageId) {
    throw new Error(localize("runtime:stream.messageIdMissing"));
  }
  let index = state.aiToolIndexes.get(callId);
  if (index === undefined) {
    index = state.aiToolIndexes.size;
    state.aiToolIndexes.set(callId, index);
  }
  return { index, messageId, partId: toolPart(state.parts, index) };
}
