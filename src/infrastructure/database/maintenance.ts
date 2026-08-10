import {
  checkpointWrites,
  checkpoints,
  hookUsage,
  hostLeases,
  messages,
  queue,
  sessions,
} from "./schema";
import type { Database } from "bun:sqlite";
import { createSessionRecord } from "./records/sessions";
import { deleteSessionStream } from "./records/streamEvents";
import { eq } from "drizzle-orm";
import { sessionDatabase } from "./connection";

export function resetSessionStorage(
  db: Database,
  sessionId: string,
  workspace: string,
  profiles: readonly string[],
) {
  const orm = sessionDatabase(db),
    previousRevision =
      orm
        .select({ revision: sessions.transcriptRevision })
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .get()?.revision ?? -1;
  if (!Number.isSafeInteger(previousRevision) || previousRevision >= Number.MAX_SAFE_INTEGER) {
    throw new Error(`Transcript 版本已耗尽：${sessionId}`);
  }
  orm.delete(checkpointWrites).run();
  orm.delete(checkpoints).run();
  orm.delete(hookUsage).run();
  orm.delete(hostLeases).run();
  deleteSessionStream(db, sessionId);
  orm.delete(messages).where(eq(messages.sessionId, sessionId)).run();
  orm.delete(queue).where(eq(queue.sessionId, sessionId)).run();
  orm.delete(sessions).where(eq(sessions.id, sessionId)).run();
  createSessionRecord(db, sessionId, workspace, profiles);
  orm
    .update(sessions)
    .set({ transcriptRevision: previousRevision + 1 })
    .where(eq(sessions.id, sessionId))
    .run();
}
