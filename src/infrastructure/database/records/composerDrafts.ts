import { eq, gt, gte, sql } from "drizzle-orm";
import type { Database } from "bun:sqlite";
import { composerDrafts } from "../schema";
import { sessionDatabase } from "../connection";

export function readComposerDraftRecord(db: Database, sessionId: string) {
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
}
export function writeComposerDraftRecord(
  db: Database,
  sessionId: string,
  content: string,
  revision: number,
) {
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
}
export function clearComposerDraftRecord(db: Database, sessionId: string, revision: number) {
  sessionDatabase(db)
    .insert(composerDrafts)
    .values({ content: "", revision, sessionId, updatedAt: sql`unixepoch()` })
    .onConflictDoUpdate({
      set: { content: "", revision, updatedAt: sql`unixepoch()` },
      setWhere: gte(sql`${revision}`, composerDrafts.revision),
      target: composerDrafts.sessionId,
    })
    .run();
}
