import { composerDrafts, preparationDrafts } from "../../schema";
import { eq, gt, gte, sql } from "drizzle-orm";
import type { Database } from "bun:sqlite";
import { sessionDatabase } from "../../sqlite/connection";

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
    content: row.content,
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
export function readPreparationDraftRecord(db: Database) {
  const row = sessionDatabase(db)
    .select({ content: preparationDrafts.content, revision: preparationDrafts.revision })
    .from(preparationDrafts)
    .where(eq(preparationDrafts.id, 1))
    .get();
  return row ?? { content: null, revision: 0 };
}
export function writePreparationDraftRecord(db: Database, content: string, revision: number) {
  const orm = sessionDatabase(db);
  orm
    .insert(preparationDrafts)
    .values({ content, id: 1, revision, updatedAt: sql`unixepoch()` })
    .onConflictDoUpdate({
      set: { content, revision, updatedAt: sql`unixepoch()` },
      setWhere: gt(sql`${revision}`, preparationDrafts.revision),
      target: preparationDrafts.id,
    })
    .run();
  const row = orm
    .select({ revision: preparationDrafts.revision })
    .from(preparationDrafts)
    .where(eq(preparationDrafts.id, 1))
    .get();
  if (!row) {
    throw new Error("新建会话草稿保存失败");
  }
  return row;
}
export function clearPreparationDraftRecord(db: Database, content: string, revision: number) {
  sessionDatabase(db)
    .insert(preparationDrafts)
    .values({ content, id: 1, revision, updatedAt: sql`unixepoch()` })
    .onConflictDoUpdate({
      set: { content, revision, updatedAt: sql`unixepoch()` },
      setWhere: gte(sql`${revision}`, preparationDrafts.revision),
      target: preparationDrafts.id,
    })
    .run();
}
