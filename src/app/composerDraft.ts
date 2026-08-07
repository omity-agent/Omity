import { eq, gt, gte, sql } from "drizzle-orm";
import { AgentDatabase } from "../infrastructure/database/agentDatabase";
import type { Database } from "bun:sqlite";
import { composerDrafts } from "../infrastructure/database/schema";
import { resolveSessionPaths } from "../infrastructure/configuration/sessionPaths";
import { sessionDatabase } from "../infrastructure/database/connection";

export function readSessionDraft(sessionId: string) {
  return withSessionDatabase(sessionId, (db) => {
    const row = sessionDatabase(db)
      .select({ content: composerDrafts.content, revision: composerDrafts.revision })
      .from(composerDrafts)
      .where(eq(composerDrafts.sessionId, sessionId))
      .get();
    if (!row) {
      return { content: null, revision: 0 };
    }
    return {
      content: row.content.length > 0 ? row.content : null,
      revision: row.revision,
    };
  });
}
export function writeSessionDraft(sessionId: string, content: string, revision: number) {
  return withSessionDatabase(sessionId, (db) => {
    const orm = sessionDatabase(db);
    orm
      .insert(composerDrafts)
      .values({ content, revision, sessionId, updatedAt: sql`unixepoch()` })
      .onConflictDoUpdate({
        set: { content, revision, updatedAt: sql`unixepoch()` },
        setWhere: gt(sql`${revision}`, composerDrafts.revision),
        target: composerDrafts.sessionId,
      })
      .run();
    const row = orm
      .select({ revision: composerDrafts.revision })
      .from(composerDrafts)
      .where(eq(composerDrafts.sessionId, sessionId))
      .get();
    if (!row) {
      throw new Error(`Composer 草稿保存失败：${sessionId}`);
    }
    return row;
  });
}
export function clearSessionDraft(sessionId: string, revision: number) {
  withSessionDatabase(sessionId, (db) => {
    sessionDatabase(db)
      .insert(composerDrafts)
      .values({ content: "", revision, sessionId, updatedAt: sql`unixepoch()` })
      .onConflictDoUpdate({
        set: { content: "", revision, updatedAt: sql`unixepoch()` },
        setWhere: gte(sql`${revision}`, composerDrafts.revision),
        target: composerDrafts.sessionId,
      })
      .run();
  });
}
function withSessionDatabase<T>(sessionId: string, operation: (db: Database) => T) {
  const { dbPath } = resolveSessionPaths(sessionId);
  const database = new AgentDatabase(dbPath);
  try {
    return operation(database.db);
  } finally {
    database.close();
  }
}
