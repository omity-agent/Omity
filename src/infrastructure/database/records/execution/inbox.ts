import type { Database } from "bun:sqlite";
import { DomainError } from "../../../../errors";
import type { QueuedInput } from "../../../../types";
import { cachedQuery } from "../../sqlite/connection";
import { createRunRecord } from "./transitions";
import { insertUserMessage } from "../transcript/messages/history";

export function enqueueInputRecord(
  db: Database,
  sessionId: string,
  content: string,
  submissionId?: string,
) {
  const active = cachedQuery<{ id: number }>(
      db,
      "SELECT id FROM runs WHERE session_id = ? AND status IN ('pending', 'running', 'paused')",
    ).get(sessionId),
    runId = active?.id ?? createRunRecord(db, sessionId),
    result = db.run(
      `INSERT INTO inputs (session_id, run_id, ordinal, content, submission_id)
     SELECT ?, ?, COALESCE(MAX(ordinal), -1) + 1, ?, ? FROM inputs WHERE run_id = ?`,
      [sessionId, runId, content, submissionId ?? null, runId],
    );
  return Number(result.lastInsertRowid);
}
export function consumeInputRecord(db: Database, sessionId: string, item: QueuedInput) {
  const claimed = db.run(
    `UPDATE inputs SET delivery = 'consumed'
     WHERE id = ? AND session_id = ? AND run_id = ? AND delivery <> 'canceled'
       AND EXISTS (SELECT 1 FROM runs WHERE id = inputs.run_id
         AND status IN ('pending', 'running', 'paused'))
       AND ((delivery = 'pending' AND ? IS NULL)
         OR (delivery = 'consumed' AND EXISTS (
           SELECT 1 FROM messages WHERE id = ? AND input_id = inputs.id)))`,
    [item.id, sessionId, item.runId, item.userMessageId, item.userMessageId],
  );
  if (claimed.changes !== 1) {
    throw new DomainError("INPUT_CLAIM_CONFLICT", `输入认领冲突：${item.id.toString()}`);
  }
  const messageId = item.userMessageId ?? insertUserMessage(db, sessionId, item.content, item.id);
  db.run("UPDATE runs SET status = 'running', error_json = NULL WHERE id = ?", [item.runId]);
  return messageId;
}
