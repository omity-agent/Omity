import type { Database } from "bun:sqlite";

import { type BaseMessage, ToolMessage } from "@langchain/core/messages";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { isPlainObject as isRecord } from "es-toolkit";

import { localize } from "../../../../i18n/server";
import { toolOutputSnapshot } from "../../../../runtime/toolOutput";
import { events } from "../../schema";
import { sessionDatabase } from "../../sqlite/connection";
import { nextStreamEvent } from "./streamEvents";

interface TrackedToolCall {
  callId: string;
  finished: boolean;
  messageId: string;
  partId: string;
  inputId: number;
}
export function finishToolStreams(db: Database, sessionId: string, messages: BaseMessage[]) {
  const tools = new Map(
      messages.flatMap((message) =>
        ToolMessage.isInstance(message) ? [[message.tool_call_id, message] as const] : [],
      ),
    ),
    completed = loadTrackedTools(db, sessionId).flatMap((call) => {
      const output = tools.get(call.callId);
      return output ? [{ call, output }] : [];
    }),
    finishedEvents = completed.flatMap(({ call, output }) =>
      call.finished
        ? []
        : [
            nextStreamEvent(db, {
              inputId: call.inputId,
              kind: "tool_finished",
              messageId: call.messageId,
              partId: call.partId,
              value: { callId: call.callId, output: toolOutputSnapshot(output) },
            }),
          ],
    ),
    orm = sessionDatabase(db),
    deleted = orm
      .delete(events)
      .where(
        and(
          eq(events.sessionId, sessionId),
          or(
            inArray(events.kind, ["assistant_reasoning_delta", "assistant_text_delta"]),
            ...completed.map(({ call }) =>
              and(eq(events.messageId, call.messageId), eq(events.partId, call.partId)),
            ),
          ),
        ),
      )
      .run().changes;
  return { changed: deleted > 0, events: finishedEvents };
}
function loadTrackedTools(db: Database, sessionId: string) {
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
    tracked = new Map<string, TrackedToolCall>();
  for (const row of rows) {
    const callId =
      row.kind === "tool_finished"
        ? isRecord(row.payload) && "callId" in row.payload && row.payload.callId
        : row.payload;
    if (typeof callId !== "string") {
      throw new Error(
        localize("database:transcript.toolEventCallIdMissing", {
          value0: row.kind,
        }),
      );
    }
    tracked.set(callId, {
      callId,
      finished: row.kind === "tool_finished",
      inputId: row.inputId,
      messageId: row.messageId,
      partId: row.partId,
    });
  }
  return [...tracked.values()];
}
