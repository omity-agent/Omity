import { openStoredSession } from "../storedSessions";
import { writeComposerDraftRecord } from "../infrastructure/database/records/session/composerDrafts";

export function writeSessionDraft(sessionId: string, content: string, revision: number) {
  using database = openStoredSession(sessionId);
  return writeComposerDraftRecord(database.db, sessionId, content, revision);
}
