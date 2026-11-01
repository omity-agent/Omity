import type { Database } from "bun:sqlite";

import { and, eq, lt, sql } from "drizzle-orm";

import { localize } from "../../../../i18n/server";
import { events, streamClock } from "../../schema";
import type { StreamEvent, StreamEventDraft } from "../../schema/streamEvent";
import { sessionDatabase } from "../../sqlite/connection";

export function streamEventCursor(db: Database) {
  const cursor =
    sessionDatabase(db)
      .select({ value: streamClock.value })
      .from(streamClock)
      .where(eq(streamClock.id, 1))
      .get()?.value ?? 0;
  if (!Number.isSafeInteger(cursor)) {
    throw new Error(
      localize("database:transcript.streamCursorUnsafe", {
        value0: String(cursor),
      }),
    );
  }
  return cursor;
}
export function nextStreamEvent(db: Database, event: StreamEventDraft): StreamEvent {
  const next = sessionDatabase(db)
    .insert(streamClock)
    .values({ id: 1, value: 1 })
    .onConflictDoUpdate({
      set: { value: sql`${streamClock.value} + 1` },
      setWhere: lt(streamClock.value, Number.MAX_SAFE_INTEGER),
      target: streamClock.id,
    })
    .returning({ id: streamClock.value })
    .get();
  if (!next) {
    throw new Error(
      localize("database:transcript.streamCursorUnsafe", {
        value0: Number.MAX_SAFE_INTEGER.toString(),
      }),
    );
  }
  return { ...event, id: next.id };
}
export function insertStreamEvent(
  db: Database,
  sessionId: string,
  event: StreamEventDraft,
): StreamEvent {
  const inserted = nextStreamEvent(db, event);
  sessionDatabase(db)
    .insert(events)
    .values({
      id: inserted.id,
      inputId: event.inputId,
      kind: event.kind,
      messageId: event.messageId,
      partId: event.partId,
      payload: event.value,
      sessionId,
    })
    .run();
  return inserted;
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
