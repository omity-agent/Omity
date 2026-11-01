import type { Database } from "bun:sqlite";

import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import type { FileLinkSet, FileLinkSurface } from "../../../../fileLinks/types";
import { fileLinkSets } from "../../schema";
import { sessionDatabase } from "../../sqlite/connection";

export interface StoredFileLinkSet extends FileLinkSet {
  inputId: number | null;
}
export function loadFileLinkSets(db: Database, sessionId: string): FileLinkSet[] {
  return sessionDatabase(db)
    .select({
      matches: fileLinkSets.matches,
      ownerId: fileLinkSets.ownerId,
      surface: fileLinkSets.surface,
    })
    .from(fileLinkSets)
    .where(eq(fileLinkSets.sessionId, sessionId))
    .all();
}
export function readStreamLinks(
  db: Database,
  sessionId: string,
  ownerId: string,
  surface: FileLinkSurface,
) {
  return (
    sessionDatabase(db)
      .select({ matches: fileLinkSets.matches })
      .from(fileLinkSets)
      .where(
        and(
          eq(fileLinkSets.sessionId, sessionId),
          eq(fileLinkSets.ownerId, ownerId),
          eq(fileLinkSets.surface, surface),
        ),
      )
      .get()?.matches ?? []
  );
}
export function writeFileLinkSets(db: Database, sessionId: string, links: StoredFileLinkSet[]) {
  const orm = sessionDatabase(db);
  for (const link of links) {
    orm
      .insert(fileLinkSets)
      .values({ ...link, sessionId })
      .onConflictDoUpdate({
        set: {
          inputId: link.inputId,
          matches: link.matches,
        },
        target: [fileLinkSets.sessionId, fileLinkSets.ownerId, fileLinkSets.surface],
      })
      .run();
  }
}
export function deleteInputFileLinks(db: Database, inputId: number) {
  sessionDatabase(db).delete(fileLinkSets).where(eq(fileLinkSets.inputId, inputId)).run();
}
export function clearStreamLinks(db: Database, sessionId: string) {
  return sessionDatabase(db)
    .delete(fileLinkSets)
    .where(and(eq(fileLinkSets.sessionId, sessionId), isNotNull(fileLinkSets.inputId)))
    .run().changes;
}
export function clearMessageLinks(db: Database, sessionId: string, ownerIds?: string[]) {
  if (ownerIds?.length !== 0) {
    sessionDatabase(db)
      .delete(fileLinkSets)
      .where(
        and(
          eq(fileLinkSets.sessionId, sessionId),
          isNull(fileLinkSets.inputId),
          ownerIds === undefined ? undefined : inArray(fileLinkSets.ownerId, ownerIds),
        ),
      )
      .run();
  }
}
