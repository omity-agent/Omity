import type { Database } from "bun:sqlite";
import { appendUserQueue } from "./operations";
import { clearComposerDraftRecord } from "../composerDrafts";
import { touchSessionRecord } from "../sessions";

export function submitUserRecord(
  db: Database,
  sessionId: string,
  content: string,
  draftRevision: number,
  submissionId: string,
) {
  const insertedQueueId = appendUserQueue(db, sessionId, content, submissionId);
  clearComposerDraftRecord(db, sessionId, draftRevision);
  touchSessionRecord(db, sessionId);
  return insertedQueueId;
}
