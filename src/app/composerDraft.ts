import {
  clearComposerDraftRecord,
  readComposerDraftRecord,
  writeComposerDraftRecord,
} from "../infrastructure/database/records/composerDrafts";
import { openStoredSession } from "../storedSessions";

export function readSessionDraft(sessionId: string) {
  using database = openStoredSession(sessionId);
  return readComposerDraftRecord(database.db, sessionId);
}
export function writeSessionDraft(sessionId: string, content: string, revision: number) {
  using database = openStoredSession(sessionId);
  return writeComposerDraftRecord(database.db, sessionId, content, revision);
}
export function clearSessionDraft(sessionId: string, revision: number) {
  using database = openStoredSession(sessionId);
  clearComposerDraftRecord(database.db, sessionId, revision);
}
