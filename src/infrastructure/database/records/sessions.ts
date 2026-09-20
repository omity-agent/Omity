import { type SessionDefinition, emptySessionDefinition } from "../sessionDefinition";
import { sessionConflict, sessionNotFound } from "../../../errors";
import type { Control } from "../../../types";
import type { Database } from "bun:sqlite";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { eq } from "drizzle-orm";
import { sessionDatabase } from "../connection";
import { sessions } from "../schema";

export function createSessionRecord(
  db: Database,
  sessionId: string,
  workspace: string,
  profiles: readonly string[],
  definition: SessionDefinition = emptySessionDefinition(),
  initialControl: Control = "running",
) {
  const now = Math.floor(Date.now() / 1000),
    inserted = sessionDatabase(db)
      .insert(sessions)
      .values({
        control: initialControl,
        createdAt: now,
        definition,
        id: sessionId,
        profiles: [...profiles],
        transcriptRevision: 0,
        updatedAt: now,
        workspace,
      })
      .onConflictDoNothing({ target: sessions.id })
      .returning({ id: sessions.id })
      .all();
  if (inserted.length === 0) {
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
  return readSessionField(db, sessionId, sessions.workspace);
}
export function readProfilesRecord(db: Database, sessionId: string) {
  return readSessionField(db, sessionId, sessions.profiles);
}
export function readDefinitionRecord(db: Database, sessionId: string) {
  return readSessionField(db, sessionId, sessions.definition);
}
export function touchSessionRecord(db: Database, sessionId: string) {
  requireSessionRecord(db, sessionId);
  const result = db.run(
    `UPDATE sessions
     SET transcript_revision = transcript_revision + 1,
       updated_at = MAX(updated_at, unixepoch())
     WHERE id = ? AND transcript_revision < ?`,
    [sessionId, Number.MAX_SAFE_INTEGER],
  );
  if (result.changes !== 1) {
    throw new Error(`Transcript 版本已耗尽：${sessionId}`);
  }
}
export function touchQueueSessionRecord(db: Database, queueId: number) {
  const result = db.run(
    `UPDATE sessions
     SET updated_at = MAX(updated_at, unixepoch()),
       transcript_revision = transcript_revision + 1
     WHERE id = (SELECT session_id FROM queue WHERE id = ?)
       AND transcript_revision < ?`,
    [queueId, Number.MAX_SAFE_INTEGER],
  );
  if (result.changes !== 1) {
    throw new Error(`队列不存在或 Transcript 版本已耗尽：${queueId.toString()}`);
  }
}
export function readTranscriptRevisionRecord(db: Database, sessionId: string) {
  const revision = readSessionField(db, sessionId, sessions.transcriptRevision);
  if (!Number.isSafeInteger(revision)) {
    throw new Error(`Transcript 版本无效：${sessionId}`);
  }
  return revision;
}
export function readControlRecord(db: Database, sessionId: string): Control {
  return readSessionField(db, sessionId, sessions.control);
}
function readSessionField<Column extends SQLiteColumn>(
  db: Database,
  sessionId: string,
  column: Column,
) {
  const row = sessionDatabase(db)
    .select({ value: column })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get();
  if (!row) {
    throw sessionNotFound(sessionId);
  }
  return row.value;
}
export function writeControlRecord(db: Database, sessionId: string, control: Control) {
  requireSessionRecord(db, sessionId);
  const result = db.run(
    `UPDATE sessions
     SET control = ?, transcript_revision = transcript_revision + 1,
       updated_at = MAX(updated_at, unixepoch())
     WHERE id = ? AND control <> ? AND transcript_revision < ?`,
    [control, sessionId, control, Number.MAX_SAFE_INTEGER],
  );
  if (result.changes === 1) {
    return true;
  }
  if (readControlRecord(db, sessionId) === control) {
    return false;
  }
  throw new Error(`Transcript 版本已耗尽：${sessionId}`);
}
export function consumeStepControlRecord(db: Database, sessionId: string) {
  requireSessionRecord(db, sessionId);
  const result = db.run(
    `UPDATE sessions
     SET control = 'pause', transcript_revision = transcript_revision + 1,
       updated_at = MAX(updated_at, unixepoch())
     WHERE id = ? AND control = 'step' AND transcript_revision < ?`,
    [sessionId, Number.MAX_SAFE_INTEGER],
  );
  if (result.changes === 1) {
    return true;
  }
  if (readControlRecord(db, sessionId) === "step") {
    throw new Error(`Transcript 版本已耗尽：${sessionId}`);
  }
  return false;
}
