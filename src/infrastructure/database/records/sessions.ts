import { sessionConflict, sessionNotFound } from "../../../errors";
import type { Control } from "../../../types";
import type { Database } from "bun:sqlite";
import { queryGet } from "../connection";
import { settingsProfileNamesSchema } from "../../configuration/settings/context";

export function createSessionRecord(
  db: Database,
  sessionId: string,
  workspace: string,
  profiles: readonly string[],
) {
  if (hasSessionRecord(db, sessionId)) {
    throw sessionConflict(sessionId);
  }
  const result = db.run(
    "INSERT INTO sessions (id, workspace, profiles_json, control, created_at, updated_at) VALUES (?, ?, ?, 'running', unixepoch(), unixepoch())",
    [sessionId, workspace, JSON.stringify(settingsProfileNamesSchema.parse(profiles))],
  );
  if (result.changes !== 1) {
    throw sessionConflict(sessionId);
  }
}
export function hasSessionRecord(db: Database, sessionId: string) {
  const query = db.prepare<{ value: number }, [string]>(
    "SELECT 1 AS value FROM sessions WHERE id = ?",
  );
  let row: { value: number } | null;
  try {
    row = query.get(sessionId);
  } finally {
    query.finalize();
  }
  return row !== null;
}
export function requireSessionRecord(db: Database, sessionId: string) {
  if (!hasSessionRecord(db, sessionId)) {
    throw sessionNotFound(sessionId);
  }
}
export function readWorkspaceRecord(db: Database, sessionId: string) {
  requireSessionRecord(db, sessionId);
  const row = queryGet<{ workspace: string }>(
    db,
    "SELECT workspace FROM sessions WHERE id = ?",
    sessionId,
  );
  if (!row) {
    throw sessionNotFound(sessionId);
  }
  return row.workspace;
}
export function readProfilesRecord(db: Database, sessionId: string) {
  requireSessionRecord(db, sessionId);
  const row = queryGet<{ profiles_json: string }>(
    db,
    "SELECT profiles_json FROM sessions WHERE id = ?",
    sessionId,
  );
  if (!row) {
    throw sessionNotFound(sessionId);
  }
  return settingsProfileNamesSchema.parse(JSON.parse(row.profiles_json) as unknown);
}
export function touchSessionRecord(db: Database, sessionId: string) {
  requireSessionRecord(db, sessionId);
  db.run("UPDATE sessions SET updated_at = MAX(updated_at, unixepoch()) WHERE id = ?", [sessionId]);
}
export function touchQueueSessionRecord(db: Database, queueId: number) {
  const result = db.run(
    `UPDATE sessions SET updated_at = MAX(updated_at, unixepoch())
     WHERE id = (SELECT session_id FROM queue WHERE id = ?)`,
    [queueId],
  );
  if (result.changes !== 1) {
    throw new Error(`队列不存在：${queueId.toString()}`);
  }
}
export function readControlRecord(db: Database, sessionId: string): Control {
  requireSessionRecord(db, sessionId);
  const query = db.prepare<{ control: Control }, [string]>(
    "SELECT control FROM sessions WHERE id = ?",
  );
  let row: { control: Control } | null;
  try {
    row = query.get(sessionId);
  } finally {
    query.finalize();
  }
  if (!row) {
    throw sessionNotFound(sessionId);
  }
  return row.control;
}
export function writeControlRecord(db: Database, sessionId: string, control: Control) {
  requireSessionRecord(db, sessionId);
  db.run(
    "UPDATE sessions SET control = ?, updated_at = MAX(updated_at, unixepoch()) WHERE id = ?",
    [control, sessionId],
  );
}
