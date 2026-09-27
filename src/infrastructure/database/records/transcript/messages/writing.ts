import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { inputs, messages } from "../../../schema";
import type { Database } from "bun:sqlite";
import { sessionDatabase } from "../../../sqlite/connection";

const statements = new WeakMap<Database, ReturnType<typeof prepareMessageMutations>>();
export function messageMutations(db: Database) {
  return statements.getOrInsertComputed(db, prepareMessageMutations);
}
export function pruneUnreferencedMessages(db: Database, sessionId?: string) {
  sessionDatabase(db)
    .delete(messages)
    .where(
      and(
        isNull(messages.position),
        sessionId === undefined ? undefined : eq(messages.sessionId, sessionId),
      ),
    )
    .run();
}
function prepareMessageMutations(db: Database) {
  const orm = sessionDatabase(db),
    sessionId = sql.placeholder("sessionId"),
    inputId = sql.placeholder("inputId"),
    position = sql.placeholder("position"),
    messageJson = sql`${sql.placeholder("messageJson")}`,
    tokenCount = sql.placeholder("tokenCount");
  return {
    consume: orm
      .update(inputs)
      .set({ delivery: "consumed" })
      .where(
        and(
          eq(inputs.id, inputId),
          eq(inputs.sessionId, sessionId),
          eq(inputs.delivery, "pending"),
        ),
      )
      .prepare(),
    detach: orm
      .update(messages)
      .set({ inputId: null, position: null })
      .where(and(eq(messages.sessionId, sessionId), gte(messages.position, position)))
      .prepare(),
    nextPosition: orm
      .select({ position: sql<number>`coalesce(max(${messages.position}), -1) + 1` })
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .prepare(),
    store: orm
      .insert(messages)
      .values({
        createdAt: sql`coalesce(${sql.placeholder("createdAt")}, unixepoch())`,
        inputId,
        message: messageJson,
        position,
        sessionId,
        sourceId: sql.placeholder("sourceId"),
        tokenCount,
      })
      .onConflictDoUpdate({
        set: {
          inputId: sql`coalesce(${inputId}, ${messages.inputId})`,
          message: messageJson,
          position: sql`coalesce(${position}, ${messages.position})`,
          tokenCount,
        },
        target: [messages.sessionId, messages.sourceId],
      })
      .returning({ id: messages.id })
      .prepare(),
  };
}
