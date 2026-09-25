import {
  type ReasoningTranslation,
  storeReasoningTranslation,
} from "../infrastructure/database/records/transcript/reasoningTranslations";
import { openStoredSession } from "../storedSessions";

export function writeReasoningTranslation(sessionId: string, submission: ReasoningTranslation) {
  using database = openStoredSession(sessionId);
  storeReasoningTranslation(database.db, sessionId, submission);
  return submission;
}
