import { runTransaction, sessionDatabase } from "./sqlite/connection";
import type { Database } from "bun:sqlite";
import type { SessionDefinition } from "./session/sessionDefinition";
import { createSessionRecord } from "./records/session/metadata";
import { eq } from "drizzle-orm";
import { localize } from "../../i18n/server";
import { sessions } from "./schema";

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
    throw new Error(
      localize("database:maintenance.transcriptRevisionExhausted", { value0: sessionId }),
    );
  }
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
    sessionDatabase(db).delete(sessions).where(eq(sessions.id, sessionId)).run();
  });
}
