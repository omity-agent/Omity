import { type BaseMessage, ToolMessage } from "@langchain/core/messages";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "bun:sqlite";
import { events } from "../../schema";
import { insertStreamEvent } from "./streamEvents";
import { isPlainObject as isRecord } from "es-toolkit";
import { localize } from "../../../../i18n/server";
import { sessionDatabase } from "../../sqlite/connection";
import { toolOutputSnapshot } from "../../../../runtime/toolOutput";

interface StartedToolCall {
  callId: string;
  messageId: string;
  partId: string;
  inputId: number;
}
export function finishToolStreams(db: Database, sessionId: string, messages: BaseMessage[]) {
  const started = loadStartedToolCalls(db, sessionId),
    deletedText = deleteTextStreams(db, sessionId),
    completedTools = new Map(
      messages.flatMap((message) =>
        ToolMessage.isInstance(message) ? [[message.tool_call_id, message] as const] : [],
      ),
    ),
    finishedEvents = started.flatMap((tool) =>
      completedTools.has(tool.callId)
        ? [
            insertStreamEvent(db, sessionId, {
              inputId: tool.inputId,
              kind: "tool_finished",
              messageId: tool.messageId,
              partId: tool.partId,
              value: {
                callId: tool.callId,
                output: toolOutputSnapshot(requiredTool(completedTools, tool.callId)),
              },
            }),
          ]
        : [],
    );
  return { changed: deletedText || finishedEvents.length > 0, events: finishedEvents };
}
function loadStartedToolCalls(db: Database, sessionId: string): StartedToolCall[] {
  const rows = sessionDatabase(db)
      .select()
      .from(events)
      .where(
        and(
          eq(events.sessionId, sessionId),
          inArray(events.kind, ["tool_started", "tool_finished"]),
        ),
      )
      .orderBy(asc(events.id))
      .all(),
    finished = new Set(
      rows.flatMap((row) =>
        row.kind === "tool_finished" ? [readCallId(row.kind, row.payload)] : [],
      ),
    ),
    started = new Map<string, StartedToolCall>(),
    pending = rows.filter(
      (row): row is typeof row & { kind: "tool_started" } => row.kind === "tool_started",
    );
  for (const row of pending) {
    const callId = readCallId(row.kind, row.payload);
    if (!finished.has(callId)) {
      const existing = started.get(callId);
      if (
        existing &&
        (existing.messageId !== row.messageId ||
          existing.partId !== row.partId ||
          existing.inputId !== row.inputId)
      ) {
        throw new Error(
          localize("database:transcript.toolStreamIdentityDuplicate", { value0: callId }),
        );
      }
      started.set(callId, {
        callId,
        inputId: row.inputId,
        messageId: row.messageId,
        partId: row.partId,
      });
    }
  }
  return [...started.values()];
}
function readCallId(kind: "tool_finished" | "tool_started", payload: unknown) {
  const callId =
    kind === "tool_finished"
      ? isRecord(payload) && typeof payload["callId"] === "string"
        ? payload["callId"]
        : undefined
      : payload;
  if (typeof callId !== "string" || callId.length === 0) {
    throw new Error(
      localize("database:transcript.toolEventCallIdMissing", {
        value0: localize(
          kind === "tool_started" ? "errors:generic.started" : "errors:generic.completed",
        ),
      }),
    );
  }
  return callId;
}
function deleteTextStreams(db: Database, sessionId: string) {
  return (
    db.run(
      `DELETE FROM events
     WHERE session_id = ?
       AND kind IN ('assistant_reasoning_delta', 'assistant_text_delta')`,
      [sessionId],
    ).changes > 0
  );
}
function requiredTool(tools: Map<string, ToolMessage>, callId: string) {
  const tool = tools.get(callId);
  if (!tool) {
    throw new Error(
      localize("database:transcript.toolOutputMissing", {
        value0: callId,
      }),
    );
  }
  return tool;
}
