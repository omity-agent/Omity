import { cachedQuery, queryAll } from "../../sqlite/connection";
import type { Database } from "bun:sqlite";
import type { ErrorDetails } from "../../../../failures/details";
import type { RunStatus } from "../../../../types";
import { requireSessionRecord } from "../session/metadata";

export function createRunRecord(db: Database, sessionId: string, status: RunStatus = "pending") {
  return Number(
    db.run("INSERT INTO runs (session_id, status) VALUES (?, ?)", [sessionId, status])
      .lastInsertRowid,
  );
}
export function runStatusRecord(db: Database, runId: number) {
  return requireRun(db, runId).status;
}
export function setRunStatusRecord(
  db: Database,
  runId: number,
  status: RunStatus,
  error?: ErrorDetails,
) {
  const run = requireRun(db, runId);
  db.run(
    `UPDATE runs SET status = ?, error_json =
       CASE WHEN ? = 'paused' AND ? IS NULL THEN error_json ELSE ? END
     WHERE id = ?`,
    [
      status,
      status,
      error ? JSON.stringify(error) : null,
      error ? JSON.stringify(error) : null,
      runId,
    ],
  );
  if (status === "done" || status === "canceled") {
    db.run("DELETE FROM checkpoints WHERE run_id = ?", [runId]);
    carryPendingInputs(db, runId, run.session_id);
  }
}
export function pauseRunRecord(
  db: Database,
  sessionId: string,
  runId: number,
  error?: ErrorDetails,
) {
  requireSessionRecord(db, sessionId);
  return db.run(
    `UPDATE runs SET status = 'paused', error_json = COALESCE(?, error_json)
     WHERE id = ? AND session_id = ? AND status IN ('pending', 'running', 'paused')`,
    [error ? JSON.stringify(error) : null, runId, sessionId],
  ).changes;
}
export function runInputIds(db: Database, runId: number) {
  return queryAll<{ id: number }>(
    db,
    "SELECT id FROM inputs WHERE run_id = ? ORDER BY ordinal",
    runId,
  ).map(({ id }) => id);
}
function requireRun(db: Database, runId: number) {
  const run = cachedQuery<{ session_id: string; status: RunStatus }>(
    db,
    "SELECT session_id, status FROM runs WHERE id = ?",
  ).get(runId);
  if (!run) {
    throw new Error(`执行轮次不存在：${runId.toString()}`);
  }
  return run;
}
function carryPendingInputs(db: Database, runId: number, sessionId: string) {
  const pending = queryAll<{ id: number }>(
    db,
    "SELECT id FROM inputs WHERE run_id = ? AND delivery = 'pending' AND ordinal > 0 ORDER BY ordinal",
    runId,
  );
  if (pending.length > 0) {
    const successor = createRunRecord(db, sessionId);
    for (const [ordinal, input] of pending.entries()) {
      db.run("UPDATE inputs SET run_id = ?, ordinal = ? WHERE id = ?", [
        successor,
        ordinal,
        input.id,
      ]);
    }
  }
  db.run("UPDATE inputs SET delivery = 'canceled' WHERE run_id = ? AND delivery = 'pending'", [
    runId,
  ]);
}
