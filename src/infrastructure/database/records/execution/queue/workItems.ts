import { type SQL, and, eq, min, ne, sql } from "drizzle-orm";
import { activeRuns, inputs, runs } from "../../../schema/execution";
import type { Database } from "bun:sqlite";
import { messages } from "../../../schema/conversation";
import { requireSessionRecord } from "../../session/metadata";
import { sessionDatabase } from "../../../sqlite/connection";

const statements = new WeakMap<Database, ReturnType<typeof prepareWorkQueries>>();
export function pendingInputRows(db: Database, sessionId: string) {
  return queries(db).pending.all({ sessionId });
}
export function consumedInputRows(db: Database, sessionId: string, runId: number) {
  return queries(db).consumed.all({ runId, sessionId });
}
export function nextInputRow(db: Database, sessionId: string) {
  return queries(db).next.get({ sessionId }) ?? null;
}
export function activeInputRows(db: Database, sessionId: string) {
  requireSessionRecord(db, sessionId);
  return queries(db).active.all({ sessionId });
}
export function transcriptInputRows(db: Database, sessionId: string) {
  return queries(db).transcript.all({ sessionId });
}
function queries(db: Database) {
  return statements.getOrInsertComputed(db, prepareWorkQueries);
}
function prepareWorkQueries(db: Database) {
  const orm = sessionDatabase(db),
    fields = {
      content: inputs.content,
      id: inputs.id,
      runId: inputs.runId,
      status: sql`CASE WHEN ${inputs.delivery} = 'canceled' THEN 'canceled'
        WHEN ${inputs.delivery} = 'pending' AND ${inputs.ordinal} > 0 THEN 'pending'
        ELSE ${runs.status} END`.mapWith(runs.status),
      userMessageId: messages.id,
    },
    active = and(activeRuns(), ne(inputs.delivery, "canceled")),
    // SQLite/Bun 组合的参数化 LIMIT 会增加热查询开销。
    nextId = orm
      .select({ id: min(inputs.id) })
      .from(inputs)
      .innerJoin(runs, eq(runs.id, inputs.runId))
      .where(and(eq(inputs.sessionId, sql.placeholder("sessionId")), active));
  function select(condition?: SQL) {
    return orm
      .select(fields)
      .from(inputs)
      .innerJoin(runs, eq(runs.id, inputs.runId))
      .leftJoin(messages, eq(messages.inputId, inputs.id))
      .where(and(eq(inputs.sessionId, sql.placeholder("sessionId")), condition))
      .orderBy(inputs.id);
  }
  return {
    active: select(active).prepare(),
    consumed: select(
      and(
        activeRuns(),
        eq(inputs.runId, sql.placeholder("runId")),
        eq(inputs.delivery, "consumed"),
      ),
    ).prepare(),
    next: select(eq(inputs.id, nextId)).prepare(),
    pending: select(and(activeRuns(), eq(inputs.delivery, "pending"))).prepare(),
    transcript: orm
      .select({ ...fields, error: runs.error, submissionId: inputs.submissionId })
      .from(inputs)
      .innerJoin(runs, eq(runs.id, inputs.runId))
      .leftJoin(messages, eq(messages.inputId, inputs.id))
      .where(eq(inputs.sessionId, sql.placeholder("sessionId")))
      .orderBy(inputs.id)
      .prepare(),
  };
}
