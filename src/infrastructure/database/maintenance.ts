import { hookUsage, hostLeases, messages, queue, reasoningTranslations, sessions } from "./schema";
import { runTransaction, sessionDatabase } from "./connection";
import type { Database } from "bun:sqlite";
import type { SessionDefinition } from "./sessionDefinition";
import { createSessionRecord } from "./records/sessions";
import { deleteSessionStream } from "./records/streamEvents";
import { eq } from "drizzle-orm";

export function resetSessionStorage(
  db: Database,
  sessionId: string,
  workspace: string,
  profiles: readonly string[],
  initialDefinition: SessionDefinition,
) {
  runTransaction(db, () => {
    replaceSessionStorage(db, sessionId, workspace, profiles, initialDefinition);
  });
}
function replaceSessionStorage(
  db: Database,
  sessionId: string,
  workspace: string,
  profiles: readonly string[],
  initialDefinition: SessionDefinition,
) {
  const orm = sessionDatabase(db),
    previous = orm
      .select({
        definition: sessions.definition,
        profiles: sessions.profiles,
        revision: sessions.transcriptRevision,
      })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .get(),
    previousRevision = previous?.revision ?? -1;
  if (!Number.isSafeInteger(previousRevision) || previousRevision >= Number.MAX_SAFE_INTEGER) {
    throw new Error(`Transcript 版本已耗尽：${sessionId}`);
  }
  deleteSessionCheckpoints(db, sessionId);
  orm.delete(hookUsage).where(eq(hookUsage.sessionId, sessionId)).run();
  orm.delete(hostLeases).where(eq(hostLeases.sessionId, sessionId)).run();
  deleteSessionStream(db, sessionId);
  orm.delete(reasoningTranslations).where(eq(reasoningTranslations.sessionId, sessionId)).run();
  orm.delete(messages).where(eq(messages.sessionId, sessionId)).run();
  orm.delete(queue).where(eq(queue.sessionId, sessionId)).run();
  orm.delete(sessions).where(eq(sessions.id, sessionId)).run();
  createSessionRecord(
    db,
    sessionId,
    workspace,
    previous?.profiles ?? profiles,
    previous?.definition ?? initialDefinition,
  );
  orm
    .update(sessions)
    .set({ transcriptRevision: previousRevision + 1 })
    .where(eq(sessions.id, sessionId))
    .run();
}
export function deleteSessionStorage(db: Database, sessionId: string) {
  runTransaction(db, () => {
    deleteSessionCheckpoints(db, sessionId);
    sessionDatabase(db).delete(sessions).where(eq(sessions.id, sessionId)).run();
  });
}
function deleteSessionCheckpoints(db: Database, sessionId: string) {
  const pattern = `${sessionId}:%`;
  db.run("DELETE FROM checkpoint_writes WHERE thread_id LIKE ?", [pattern]);
  db.run("DELETE FROM checkpoints WHERE thread_id LIKE ?", [pattern]);
}
