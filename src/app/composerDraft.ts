import { writeComposerDraftRecord } from "../infrastructure/database/records/session/composerDrafts";
import { openStoredSession } from "../storedSessions";

export function writeSessionDraft(sessionId: string, content: string, revision: number) {
  using database = openStoredSession(sessionId);
  return writeComposerDraftRecord(database.db, sessionId, content, revision);
}
