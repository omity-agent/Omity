import {
  clearPreparationDraftRecord,
  readPreparationDraftRecord,
  writeComposerDraftRecord,
  writePreparationDraftRecord,
} from "../../infrastructure/database/records/session/composerDrafts";
import {
  closeDatabase,
  openSessionDatabase,
} from "../../infrastructure/database/sqlite/connection";
import type { Database } from "bun:sqlite";
import { databasePath } from "../../infrastructure/configuration/sessionPaths";
import { emptyPreparation } from "./preparation";
import { openStoredSession } from "../../storedSessions";

export function writeSessionDraft(sessionId: string, content: string, revision: number) {
  using database = openStoredSession(sessionId);
  return writeComposerDraftRecord(database.db, sessionId, content, revision);
}
export function readPreparationDraft() {
  return withDraftDatabase(readPreparationDraftRecord);
}
export function writePreparationDraft(content: string, revision: number) {
  return withDraftDatabase((db) => writePreparationDraftRecord(db, content, revision));
}
export function clearPreparationDraft(revision: number) {
  withDraftDatabase((db) =>
    clearPreparationDraftRecord(db, JSON.stringify(emptyPreparation()), revision),
  );
}
function withDraftDatabase<T>(operation: (db: Database) => T) {
  const db = openSessionDatabase(databasePath());
  try {
    return operation(db);
  } finally {
    closeDatabase(db);
  }
}
