import { readControlRecord, requireSessionRecord } from "../sessions";
import type { Database } from "bun:sqlite";
import { controlNotReady } from "../../../../errors";
import { queryGet } from "../../connection";

export function requestStepControlRecord(db: Database, sessionId: string) {
  requireSessionRecord(db, sessionId);
  const result = db.run(
    `UPDATE sessions
     SET control = 'step', transcript_revision = transcript_revision + 1,
       updated_at = MAX(updated_at, unixepoch())
     WHERE id = ? AND control IN ('running', 'pause')
       AND EXISTS (
         SELECT 1 FROM queue
         WHERE session_id = ? AND status = 'paused'
       )
       AND NOT EXISTS (
         SELECT 1 FROM queue
         WHERE session_id = ? AND status = 'running'
       )
       AND transcript_revision < ?`,
    [sessionId, sessionId, sessionId, Number.MAX_SAFE_INTEGER],
  );
  if (result.changes === 1) {
    return;
  }
  const control = readControlRecord(db, sessionId);
  const ready = hasSteppableRunRecord(db, sessionId);
  if (control === "step" && ready) {
    return;
  }
  if ((control === "running" || control === "pause") && ready) {
    throw new Error(`Transcript 版本已耗尽：${sessionId}`);
  }
  throw controlNotReady("step");
}
function hasSteppableRunRecord(db: Database, sessionId: string) {
  const row = queryGet<{ ready: number }>(
    db,
    `SELECT
       EXISTS(SELECT 1 FROM queue WHERE session_id = ? AND status = 'paused')
       AND NOT EXISTS(SELECT 1 FROM queue WHERE session_id = ? AND status = 'running')
       AS ready`,
    sessionId,
    sessionId,
  );
  return row?.ready === 1;
}
