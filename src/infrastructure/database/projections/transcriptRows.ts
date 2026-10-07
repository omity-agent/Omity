import { and, eq, isNotNull, sql } from "drizzle-orm";
import { events, messages } from "../schema";
import type { Database } from "bun:sqlite";
import { localize } from "../../../i18n/server";
import { sessionDatabase } from "../sqlite/connection";
import { streamEventSchema } from "../schema/streamEvent";

const statements = new WeakMap<Database, ReturnType<typeof prepareTranscriptRows>>();
export function transcriptMessageRows(db: Database, sessionId: string) {
  return queries(db).messages.all({ sessionId });
}
export function transcriptEvents(db: Database, sessionId: string) {
  return queries(db)
    .events.all({ sessionId })
    .map(({ fileLinks, ...event }) => {
      const parsed = streamEventSchema.safeParse({
        ...event,
        ...(Array.isArray(fileLinks) && fileLinks.length === 0 ? {} : { fileLinks }),
      });
      if (!parsed.success) {
        throw new Error(localize("database:transcript.streamEventInvalid"), {
          cause: parsed.error,
        });
      }
      return parsed.data;
    });
}
function queries(db: Database) {
  return statements.getOrInsertComputed(db, prepareTranscriptRows);
}
function prepareTranscriptRows(db: Database) {
  const orm = sessionDatabase(db),
    sessionId = sql.placeholder("sessionId");
  return {
    events: orm
      .select({
        fileLinks: events.fileLinks,
        id: events.id,
        inputId: events.inputId,
        kind: events.kind,
        messageId: events.messageId,
        partId: events.partId,
        value: events.payload,
      })
      .from(events)
      .where(eq(events.sessionId, sessionId))
      .orderBy(events.id)
      .prepare(),
    messages: orm
      .select({
        createdAt: messages.createdAt,
        id: messages.id,
        inputId: messages.inputId,
        messageJson: sql<string>`${messages.message}`,
        sourceId: messages.sourceId,
        tokenCount: messages.tokenCount,
      })
      .from(messages)
      .where(and(eq(messages.sessionId, sessionId), isNotNull(messages.position)))
      .orderBy(messages.position)
      .prepare(),
  };
}
