import type { Database, SQLQueryBindings } from "bun:sqlite";
import type { QueuedInput, RunStatus } from "../../../../types";
import { queryAll } from "../../sqlite/connection";
import { requireSessionRecord } from "../session/metadata";

interface InputRow {
  id: number;
  run_id: number;
  content: string;
  status: RunStatus;
  user_message_id: number | null;
  error: string | null;
  submission_id: string | null;
}
const activeRun = "r.status IN ('pending', 'running', 'paused')",
  inputSelection = `
  SELECT i.id, i.run_id, i.content,
    CASE WHEN i.delivery = 'canceled' THEN 'canceled'
      WHEN i.delivery = 'pending' AND i.ordinal > 0 THEN 'pending'
      ELSE r.status END AS status,
    m.id AS user_message_id, r.error_json AS error, i.submission_id
  FROM inputs i JOIN runs r ON r.id = i.run_id
  LEFT JOIN messages m ON m.input_id = i.id`;
export function pendingInputRows(db: Database, sessionId: string) {
  return readItems(db, sessionId, `${activeRun} AND i.delivery = 'pending'`);
}
export function consumedInputRows(db: Database, sessionId: string, runId: number) {
  return readItems(db, sessionId, `${activeRun} AND i.run_id = ? AND i.delivery = 'consumed'`, [
    runId,
  ]);
}
export function nextInputRow(db: Database, sessionId: string) {
  return readItems(db, sessionId, `${activeRun} AND i.delivery <> 'canceled'`, [], true)[0] ?? null;
}
export function activeInputRows(db: Database, sessionId: string) {
  requireSessionRecord(db, sessionId);
  return readItems(db, sessionId, `${activeRun} AND i.delivery <> 'canceled'`);
}
export function transcriptInputRows(db: Database, sessionId: string) {
  return queryAll<InputRow>(
    db,
    `${inputSelection} WHERE i.session_id = ? ORDER BY i.id`,
    sessionId,
  );
}
function readItems(
  db: Database,
  sessionId: string,
  condition: string,
  args: SQLQueryBindings[] = [],
  firstOnly = false,
): QueuedInput[] {
  return queryAll<InputRow>(
    db,
    `${inputSelection} WHERE i.session_id = ? AND ${condition} ORDER BY i.id${firstOnly ? " LIMIT 1" : ""}`,
    sessionId,
    ...args,
  ).map((row) => ({
    content: row.content,
    id: row.id,
    runId: row.run_id,
    status: row.status,
    userMessageId: row.user_message_id,
  }));
}
