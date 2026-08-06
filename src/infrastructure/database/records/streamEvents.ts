import { type BaseMessage, ToolMessage } from "@langchain/core/messages";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Database } from "bun:sqlite";
import { events } from "../schema";
import { sessionDatabase } from "../connection";

const sqliteSequence = sqliteTable("sqlite_sequence", {
  name: text().notNull(),
  seq: integer().notNull(),
});
export interface StreamToolCallDelta {
  index: number;
  argumentsDelta?: string;
  freeform?: boolean;
  idDelta?: string;
  nameDelta?: string;
}
export type StreamEventKind =
  | "assistant_reasoning_delta"
  | "assistant_text_delta"
  | "tool_call_delta"
  | "tool_finished"
  | "tool_started"
  | "user_appended";
interface StreamEventBase {
  id: number;
  messageId: string;
  partId: string;
  queueId: number;
}
export interface StreamEventValues {
  assistant_reasoning_delta: string;
  assistant_text_delta: string;
  tool_call_delta: StreamToolCallDelta;
  tool_finished: string;
  tool_started: string;
  user_appended: null;
}
type StreamEventOf<Kind extends StreamEventKind> = StreamEventBase & {
  kind: Kind;
  value: StreamEventValues[Kind];
};
export type StreamEvent = {
  [Kind in StreamEventKind]: StreamEventOf<Kind>;
}[StreamEventKind];
export type StreamEventDraft = {
  [Kind in StreamEventKind]: Omit<StreamEventOf<Kind>, "id">;
}[StreamEventKind];
interface StartedToolCall {
  callId: string;
  messageId: string;
  partId: string;
  queueId: number;
}
export function streamEventCursor(db: Database) {
  const cursor =
    sessionDatabase(db)
      .select({ value: sqliteSequence.seq })
      .from(sqliteSequence)
      .where(eq(sqliteSequence.name, "events"))
      .get()?.value ?? 0;
  if (!Number.isSafeInteger(cursor)) {
    throw new Error(`流式事件游标超出安全整数范围：${String(cursor)}`);
  }
  return cursor;
}
export function insertStreamEvent(
  db: Database,
  sessionId: string,
  event: StreamEventDraft,
): StreamEvent {
  const inserted = sessionDatabase(db)
    .insert(events)
    .values({
      kind: event.kind,
      messageId: event.messageId,
      partId: event.partId,
      payload: event.value,
      queueId: event.queueId,
      sessionId,
    })
    .returning({ id: events.id })
    .get();
  return { ...event, id: inserted.id };
}
export function insertUserBoundaryEvent(db: Database, sessionId: string, queueId: number) {
  const existing = sessionDatabase(db)
    .select({ id: events.id })
    .from(events)
    .where(
      and(
        eq(events.sessionId, sessionId),
        eq(events.queueId, queueId),
        eq(events.kind, "user_appended"),
      ),
    )
    .get();
  if (existing) {
    return null;
  }
  return insertStreamEvent(db, sessionId, {
    kind: "user_appended",
    messageId: `queue:${sessionId}:${queueId.toString()}`,
    partId: "user",
    queueId,
    value: null,
  });
}
function loadStartedToolCalls(db: Database, sessionId: string): StartedToolCall[] {
  const rows = sessionDatabase(db)
    .select()
    .from(events)
    .where(
      and(eq(events.sessionId, sessionId), inArray(events.kind, ["tool_started", "tool_finished"])),
    )
    .orderBy(asc(events.id))
    .all();
  const finished = new Set(
    rows.flatMap((row) =>
      row.kind === "tool_finished" ? [readCallId(row.kind, row.payload)] : [],
    ),
  );
  const started = new Map<string, StartedToolCall>();
  const pending = rows.filter(
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
          existing.queueId !== row.queueId)
      ) {
        throw new Error(`工具调用 ${callId} 绑定了多个流身份`);
      }
      started.set(callId, {
        callId,
        messageId: row.messageId,
        partId: row.partId,
        queueId: row.queueId,
      });
    }
  }
  return [...started.values()];
}
function readCallId(kind: "tool_finished" | "tool_started", payload: unknown) {
  const callId = payload;
  if (typeof callId !== "string" || callId.length === 0) {
    throw new Error(`工具${kind === "tool_started" ? "开始" : "完成"}事件缺少调用 ID`);
  }
  return callId;
}
export function finishToolStreams(db: Database, sessionId: string, messages: BaseMessage[]) {
  const started = loadStartedToolCalls(db, sessionId);
  const deletedText = deleteTextStreams(db, sessionId);
  const completedCallIds = new Set(
    messages.flatMap((message) => (ToolMessage.isInstance(message) ? [message.tool_call_id] : [])),
  );
  const finishedEvents = started.flatMap((tool) =>
    completedCallIds.has(tool.callId)
      ? [
          insertStreamEvent(db, sessionId, {
            kind: "tool_finished",
            messageId: tool.messageId,
            partId: tool.partId,
            queueId: tool.queueId,
            value: tool.callId,
          }),
        ]
      : [],
  );
  return { changed: deletedText || finishedEvents.length > 0, events: finishedEvents };
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
export function deleteSessionStream(db: Database, sessionId: string) {
  sessionDatabase(db)
    .delete(events)
    .where(and(eq(events.sessionId, sessionId), ne(events.kind, "user_appended")))
    .run();
}
export function deleteQueueStream(db: Database, queueId: number) {
  sessionDatabase(db).delete(events).where(eq(events.queueId, queueId)).run();
}
