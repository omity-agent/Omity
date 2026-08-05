import { eq, sql } from "drizzle-orm";
import { sessionConflict, sessionNotFound } from "../../../errors";
import type { Control } from "../../../types";
import type { Database } from "bun:sqlite";
import { sessionDatabase } from "../connection";
import { sessions } from "../schema";

export function createSessionRecord(
  db: Database,
  sessionId: string,
  workspace: string,
  profiles: readonly string[],
) {
  if (hasSessionRecord(db, sessionId)) {
    throw sessionConflict(sessionId);
  }
  try {
    const now = Math.floor(Date.now() / 1000);
    sessionDatabase(db)
      .insert(sessions)
      .values({
        control: "running",
        createdAt: now,
        id: sessionId,
        profiles: [...profiles],
        updatedAt: now,
        workspace,
      })
      .run();
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw sessionConflict(sessionId);
    }
    throw error;
  }
  if (!hasSessionRecord(db, sessionId)) {
    throw sessionConflict(sessionId);
  }
}
export function hasSessionRecord(db: Database, sessionId: string) {
  return Boolean(
    sessionDatabase(db)
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .get(),
  );
}
export function requireSessionRecord(db: Database, sessionId: string) {
  if (!hasSessionRecord(db, sessionId)) {
    throw sessionNotFound(sessionId);
  }
}
export function readWorkspaceRecord(db: Database, sessionId: string) {
  requireSessionRecord(db, sessionId);
  const row = sessionDatabase(db)
    .select({ workspace: sessions.workspace })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get();
  if (!row) {
    throw sessionNotFound(sessionId);
  }
  return row.workspace;
}
export function readProfilesRecord(db: Database, sessionId: string) {
  requireSessionRecord(db, sessionId);
  const row = sessionDatabase(db)
    .select({ profiles: sessions.profiles })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get();
  if (!row) {
    throw sessionNotFound(sessionId);
  }
  return row.profiles;
}
export function touchSessionRecord(db: Database, sessionId: string) {
  requireSessionRecord(db, sessionId);
  sessionDatabase(db)
    .update(sessions)
    .set({ updatedAt: sql`max(${sessions.updatedAt}, unixepoch())` })
    .where(eq(sessions.id, sessionId))
    .run();
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
  const row = sessionDatabase(db)
    .select({ control: sessions.control })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get();
  if (!row) {
    throw sessionNotFound(sessionId);
  }
  return row.control;
}
export function writeControlRecord(db: Database, sessionId: string, control: Control) {
  requireSessionRecord(db, sessionId);
  sessionDatabase(db)
    .update(sessions)
    .set({ control, updatedAt: sql`max(${sessions.updatedAt}, unixepoch())` })
    .where(eq(sessions.id, sessionId))
    .run();
}
