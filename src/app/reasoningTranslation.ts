import {
  type ReasoningTranslation,
  storeReasoningTranslation,
} from "../infrastructure/database/records/reasoningTranslations";
import { AgentDatabase } from "../infrastructure/database/agentDatabase";
import { resolveSessionPaths } from "../infrastructure/configuration/sessionPaths";

export type ReasoningTranslationSubmission = ReasoningTranslation;
export function writeReasoningTranslation(
  sessionId: string,
  submission: ReasoningTranslationSubmission,
) {
  const { dbPath } = resolveSessionPaths(sessionId),
    database = new AgentDatabase(dbPath);
  try {
    storeReasoningTranslation(database.db, sessionId, submission);
  } finally {
    database.close();
  }
  return submission;
}
