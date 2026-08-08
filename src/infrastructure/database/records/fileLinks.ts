import type { FileLinkSurface, FileLinkUnit, FilePathMatch } from "../../../fileLinks/types";
import { and, asc, eq } from "drizzle-orm";
import type { Database } from "bun:sqlite";
import { fileLinkUnits } from "../schema";
import { sessionDatabase } from "../connection";

export interface StoredFileLinkUnit extends FileLinkUnit {
  nextOffset: number;
  queueId: number | null;
  text: string;
}
export function loadFileLinkUnits(db: Database, sessionId: string): FileLinkUnit[] {
  return loadStoredFileLinkUnits(db, sessionId).map(toPublicUnit);
}
export function loadStoredFileLinkUnits(
  db: Database,
  sessionId: string,
  ownerId?: string,
  surface?: FileLinkSurface,
): StoredFileLinkUnit[] {
  const filters = [
    eq(fileLinkUnits.sessionId, sessionId),
    ...(ownerId === undefined ? [] : [eq(fileLinkUnits.ownerId, ownerId)]),
    ...(surface === undefined ? [] : [eq(fileLinkUnits.surface, surface)]),
  ];
  return sessionDatabase(db)
    .select()
    .from(fileLinkUnits)
    .where(and(...filters))
    .orderBy(asc(fileLinkUnits.unitIndex))
    .all()
    .map((row) => ({
      end: row.end,
      matches: row.matches,
      nextOffset: row.nextOffset,
      ownerId: row.ownerId,
      queueId: row.queueId,
      start: row.start,
      surface: row.surface,
      text: row.text,
      unitIndex: row.unitIndex,
    }));
}
export function upsertFileLinkUnits(db: Database, sessionId: string, units: StoredFileLinkUnit[]) {
  const orm = sessionDatabase(db);
  for (const unit of units) {
    orm
      .insert(fileLinkUnits)
      .values({ ...unit, sessionId })
      .onConflictDoUpdate({
        set: {
          end: unit.end,
          matches: unit.matches,
          nextOffset: unit.nextOffset,
          queueId: unit.queueId,
          start: unit.start,
          text: unit.text,
        },
        target: [
          fileLinkUnits.sessionId,
          fileLinkUnits.ownerId,
          fileLinkUnits.surface,
          fileLinkUnits.unitIndex,
        ],
      })
      .run();
  }
}
export function deleteQueueFileLinkUnits(db: Database, queueId: number) {
  sessionDatabase(db).delete(fileLinkUnits).where(eq(fileLinkUnits.queueId, queueId)).run();
}
export function publicFileLinkUnits(units: StoredFileLinkUnit[]) {
  return units.map(toPublicUnit);
}
function toPublicUnit(unit: StoredFileLinkUnit): FileLinkUnit {
  return {
    end: unit.end,
    matches: unit.matches.map(offsetMatch(unit.start)),
    ownerId: unit.ownerId,
    start: unit.start,
    surface: unit.surface,
    unitIndex: unit.unitIndex,
  };
}
function offsetMatch(offset: number) {
  return (match: FilePathMatch): FilePathMatch => ({
    ...match,
    position: {
      end: offset + match.position.end,
      start: offset + match.position.start,
    },
  });
}
