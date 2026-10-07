import { activeRuns, inputs, runs } from "../../../schema/execution";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "bun:sqlite";
import { DomainError } from "../../../../../errors";
import type { QueuedInput } from "../../../../../types";
import { createRunRecord } from "../runs/mutations";
import { insertUserMessage } from "../../transcript/messages/history";
import { localize } from "../../../../../i18n/server";
import { messages } from "../../../schema/conversation";
import { sessionDatabase } from "../../../sqlite/connection";

const statements = new WeakMap<Database, ReturnType<typeof prepareAdmission>>();
export function enqueueInputRecord(
  db: Database,
  sessionId: string,
  content: string,
  submissionId?: string,
) {
  const queries = statements.getOrInsertComputed(db, prepareAdmission),
    active = queries.active.get({ sessionId }),
    runId = active?.id ?? createRunRecord(db, sessionId);
  return queries.enqueue.get({ content, runId, sessionId, submissionId: submissionId ?? null }).id;
}
export function consumeInputRecord(db: Database, sessionId: string, item: QueuedInput) {
  const queries = statements.getOrInsertComputed(db, prepareAdmission),
    claimed = queries.claim.run({ ...item, sessionId });
  if (claimed.changes !== 1) {
    throw new DomainError(
      "INPUT_CLAIM_CONFLICT",
      localize("database:execution.inputClaimConflict", {
        value0: item.id.toString(),
      }),
    );
  }
  const messageId = item.userMessageId ?? insertUserMessage(db, sessionId, item.content, item.id);
  queries.start.run({ runId: item.runId });
  return messageId;
}
function prepareAdmission(db: Database) {
  const orm = sessionDatabase(db),
    sessionId = sql.placeholder("sessionId"),
    runId = sql.placeholder("runId"),
    userMessageId = sql.placeholder("userMessageId");
  return {
    active: orm
      .select({ id: runs.id })
      .from(runs)
      .where(and(eq(runs.sessionId, sessionId), activeRuns()))
      .prepare(),
    claim: orm
      .update(inputs)
      .set({ delivery: "consumed" })
      .where(
        sql`${inputs.id} = ${sql.placeholder("id")} AND ${inputs.sessionId} = ${sessionId}
        AND ${inputs.runId} = ${runId} AND ${inputs.delivery} <> 'canceled'
        AND EXISTS (SELECT 1 FROM ${runs} WHERE ${runs.id} = ${inputs.runId} AND ${activeRuns()})
        AND ((${inputs.delivery} = 'pending' AND ${userMessageId} IS NULL)
          OR (${inputs.delivery} = 'consumed' AND EXISTS (
            SELECT 1 FROM ${messages} WHERE ${messages.id} = ${userMessageId}
              AND ${messages.inputId} = ${inputs.id})))`,
      )
      .prepare(),
    enqueue: orm
      .insert(inputs)
      .values({
        content: sql.placeholder("content"),
        ordinal: sql`(select coalesce(max(${inputs.ordinal}), -1) + 1
        from ${inputs} where ${inputs.runId} = ${runId})`,
        runId,
        sessionId,
        submissionId: sql.placeholder("submissionId"),
      })
      .returning({ id: inputs.id })
      .prepare(),
    start: orm
      .update(runs)
      .set({ error: null, status: "running" })
      .where(eq(runs.id, runId))
      .prepare(),
  };
}
