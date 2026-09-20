import type { Database, SQLQueryBindings } from "bun:sqlite";
import type { QueueItem, QueueStatus } from "../../../../types";
import { queryAll } from "../../connection";
import { requireSessionRecord } from "../sessions";

interface QueueRow {
  id: number;
  root_id: number | null;
  content: string;
  status: QueueStatus;
  user_message_id: number | null;
}
const activeStatuses = "('pending', 'running', 'paused')";
export function pendingAppendRows(db: Database, sessionId: string) {
  return readItems(db, sessionId, "q.status = 'pending'");
}
export function consumedRunRows(db: Database, sessionId: string, runId: number | null) {
  return runId === null
    ? []
    : readItems(
        db,
        sessionId,
        `q.root_id = ? AND m.id IS NOT NULL AND q.status IN ${activeStatuses}`,
        [runId],
      );
}
export function nextQueueRow(db: Database, sessionId: string) {
  return readItems(db, sessionId, `q.status IN ${activeStatuses}`, [], true)[0] ?? null;
}
export function activeQueueRows(db: Database, sessionId: string) {
  requireSessionRecord(db, sessionId);
  return readItems(db, sessionId, `q.status IN ${activeStatuses}`);
}
function readItems(
  db: Database,
  sessionId: string,
  condition: string,
  args: SQLQueryBindings[] = [],
  firstOnly = false,
): QueueItem[] {
  return queryAll<QueueRow>(
    db,
    `SELECT q.id, q.root_id, COALESCE(q.content, '') AS content,
       q.status, m.id AS user_message_id
     FROM queue q LEFT JOIN messages m ON m.queue_id = q.id
     WHERE q.session_id = ? AND ${condition} ORDER BY q.id${firstOnly ? " LIMIT 1" : ""}`,
    sessionId,
    ...args,
  ).map(toQueueItem);
}
function toQueueItem(row: QueueRow): QueueItem {
  return {
    content: row.content,
    id: row.id,
    root: row.root_id === row.id,
    runId: row.root_id,
    status: row.status,
    userMessageId: row.user_message_id,
  };
}
