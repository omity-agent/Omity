import {
  clearComposerDraftRecord,
  readComposerDraftRecord,
  writeComposerDraftRecord,
} from "../infrastructure/database/records/composerDrafts";
import { AgentDatabase } from "../infrastructure/database/agentDatabase";
import type { Database } from "bun:sqlite";
import { resolveSessionPaths } from "../infrastructure/configuration/sessionPaths";

export function readSessionDraft(sessionId: string) {
  return withSessionDatabase(sessionId, (db) => readComposerDraftRecord(db, sessionId));
}
export function writeSessionDraft(sessionId: string, content: string, revision: number) {
  return withSessionDatabase(sessionId, (db) =>
    writeComposerDraftRecord(db, sessionId, content, revision),
  );
}
export function clearSessionDraft(sessionId: string, revision: number) {
  withSessionDatabase(sessionId, (db) => clearComposerDraftRecord(db, sessionId, revision));
}
function withSessionDatabase<T>(sessionId: string, operation: (db: Database) => T) {
  const { dbPath } = resolveSessionPaths(sessionId),
    database = new AgentDatabase(dbPath);
  try {
    return operation(database.db);
  } finally {
    database.close();
  }
}
