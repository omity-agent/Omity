import type { StreamEvent, StreamEventDraft } from "../../schema/streamEvent";
import { and, eq } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Database } from "bun:sqlite";
import { events } from "../../schema";
import { sessionDatabase } from "../../sqlite/connection";

const sqliteSequence = sqliteTable("sqlite_sequence", {
  name: text().notNull(),
  seq: integer().notNull(),
});
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
      fileLinks: event.fileLinks ?? [],
      inputId: event.inputId,
      kind: event.kind,
      messageId: event.messageId,
      partId: event.partId,
      payload: event.value,
      sessionId,
    })
    .returning({ id: events.id })
    .get();
  return { ...event, id: inserted.id };
}
export function insertUserBoundaryEvent(db: Database, sessionId: string, inputId: number) {
  const existing = sessionDatabase(db)
    .select({ id: events.id })
    .from(events)
    .where(
      and(
        eq(events.sessionId, sessionId),
        eq(events.inputId, inputId),
        eq(events.kind, "user_appended"),
      ),
    )
    .get();
  if (existing) {
    return null;
  }
  return insertStreamEvent(db, sessionId, {
    inputId,
    kind: "user_appended",
    messageId: `input:${sessionId}:${inputId.toString()}`,
    partId: "user",
    value: null,
  });
}
export function deleteInputStream(db: Database, inputId: number) {
  sessionDatabase(db).delete(events).where(eq(events.inputId, inputId)).run();
}
