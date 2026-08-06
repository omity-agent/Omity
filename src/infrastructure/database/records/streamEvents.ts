import { and, eq, ne } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Database } from "bun:sqlite";
import type { ToolOutputSnapshot } from "../../../runtime/toolOutput";
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
  tool_finished: ToolFinishedEvent;
  tool_started: string;
  user_appended: null;
}
export interface ToolFinishedEvent {
  callId: string;
  output: ToolOutputSnapshot;
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
export function deleteSessionStream(db: Database, sessionId: string) {
  sessionDatabase(db)
    .delete(events)
    .where(and(eq(events.sessionId, sessionId), ne(events.kind, "user_appended")))
    .run();
}
export function deleteQueueStream(db: Database, queueId: number) {
  sessionDatabase(db).delete(events).where(eq(events.queueId, queueId)).run();
}
