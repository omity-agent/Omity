import { type SQL, and, eq, lt, ne, sql } from "drizzle-orm";
import { type SessionDefinition, emptySessionDefinition } from "../../session/sessionDefinition";
import { inputs, sessions } from "../../schema";
import { sessionConflict, sessionNotFound } from "../../../../errors";
import type { Control } from "../../../../types";
import type { Database } from "bun:sqlite";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { sessionDatabase } from "../../sqlite/connection";

const statements = new WeakMap<Database, ReturnType<typeof prepareSessionStatements>>();
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
  return Boolean(queries(db).id.get({ sessionId }));
}
export function requireSessionRecord(db: Database, sessionId: string) {
  if (!hasSessionRecord(db, sessionId)) {
    throw sessionNotFound(sessionId);
  }
}
export function readWorkspaceRecord(db: Database, sessionId: string) {
  return readSessionField(sessionId, queries(db).workspace);
}
export function readProfilesRecord(db: Database, sessionId: string) {
  return readSessionField(sessionId, queries(db).profiles);
}
export function readDefinitionRecord(db: Database, sessionId: string) {
  return readSessionField(sessionId, queries(db).definition);
}
export function touchSessionRecord(db: Database, sessionId: string) {
  requireSessionRecord(db, sessionId);
  if (queries(db).touch.run({ sessionId }).changes !== 1) {
    throw new Error(`Transcript 版本已耗尽：${sessionId}`);
  }
}
export function touchInputSessionRecord(db: Database, inputId: number) {
  const sessionId = sessionDatabase(db)
    .select({ id: inputs.sessionId })
    .from(inputs)
    .where(eq(inputs.id, inputId));
  if (reviseSessionRecord(db, sql`(${sessionId})`) !== 1) {
    throw new Error(`队列不存在或 Transcript 版本已耗尽：${inputId.toString()}`);
  }
}
export function readTranscriptRevisionRecord(db: Database, sessionId: string) {
  const revision = readSessionField(sessionId, queries(db).revision);
  if (!Number.isSafeInteger(revision)) {
    throw new Error(`Transcript 版本无效：${sessionId}`);
  }
  return revision;
}
export function readControlRecord(db: Database, sessionId: string): Control {
  return readSessionField(sessionId, queries(db).control);
}
function readSessionField<Value>(
  sessionId: string,
  query: { get: (params: { sessionId: string }) => { value: Value } | undefined },
) {
  const row = query.get({ sessionId });
  if (!row) {
    throw sessionNotFound(sessionId);
  }
  return row.value;
}
export function writeControlRecord(db: Database, sessionId: string, control: Control) {
  requireSessionRecord(db, sessionId);
  if (reviseSessionRecord(db, sessionId, control, ne(sessions.control, control)) === 1) {
    return true;
  }
  if (readControlRecord(db, sessionId) === control) {
    return false;
  }
  throw new Error(`Transcript 版本已耗尽：${sessionId}`);
}
export function consumeStepControlRecord(db: Database, sessionId: string) {
  requireSessionRecord(db, sessionId);
  if (reviseSessionRecord(db, sessionId, "pause", eq(sessions.control, "step")) === 1) {
    return true;
  }
  if (readControlRecord(db, sessionId) === "step") {
    throw new Error(`Transcript 版本已耗尽：${sessionId}`);
  }
  return false;
}
export function reviseSessionRecord(
  db: Database,
  sessionId: string | SQL,
  control?: Control,
  condition?: SQL,
) {
  return sessionRevisionUpdate(db, sessionId, control, condition).run().changes;
}
function sessionRevisionUpdate(
  db: Database,
  sessionId: string | SQL,
  control?: Control,
  condition?: SQL,
) {
  return sessionDatabase(db)
    .update(sessions)
    .set({
      ...(control === undefined ? {} : { control }),
      transcriptRevision: sql`${sessions.transcriptRevision} + 1`,
      updatedAt: sql`max(${sessions.updatedAt}, unixepoch())`,
    })
    .where(
      and(
        eq(sessions.id, sessionId),
        lt(sessions.transcriptRevision, Number.MAX_SAFE_INTEGER),
        condition,
      ),
    );
}
function queries(db: Database) {
  return statements.getOrInsertComputed(db, prepareSessionStatements);
}
function prepareSessionStatements(db: Database) {
  const orm = sessionDatabase(db),
    sessionId = sql.placeholder("sessionId"),
    field = <Column extends SQLiteColumn>(column: Column) =>
      orm.select({ value: column }).from(sessions).where(eq(sessions.id, sessionId)).prepare();
  return {
    control: field(sessions.control),
    definition: field(sessions.definition),
    id: field(sessions.id),
    profiles: field(sessions.profiles),
    revision: field(sessions.transcriptRevision),
    touch: sessionRevisionUpdate(db, sql`${sessionId}`).prepare(),
    workspace: field(sessions.workspace),
  };
}
