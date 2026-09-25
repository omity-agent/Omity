import { requireSessionRecord, touchSessionRecord } from "../sessions";
import type { Database } from "bun:sqlite";
import { UserMessageStorage } from "../../userMessages";
import { appendUserQueue } from "./operations";
import { clearComposerDraftRecord } from "../composerDrafts";
import { resolveSessionPaths } from "../../../configuration/sessionPaths";
import { runTransaction } from "../../connection";

export class QueueSubmissionStore {
  constructor(private readonly db: Database) {}
  appendUser(sessionId: string, content: string) {
    requireSessionRecord(this.db, sessionId);
    return this.saveUserMessage(sessionId, content, (save) => {
      const queueId = appendUserQueue(this.db, sessionId, content);
      save();
      touchSessionRecord(this.db, sessionId);
      return queueId;
    });
  }
  submitUser(sessionId: string, content: string, draftRevision: number, submissionId: string) {
    requireSessionRecord(this.db, sessionId);
    return this.saveUserMessage(sessionId, content, (save) => {
      const queueId = appendUserQueue(this.db, sessionId, content, submissionId);
      clearComposerDraftRecord(this.db, sessionId, draftRevision);
      save();
      touchSessionRecord(this.db, sessionId);
      return queueId;
    });
  }
  private saveUserMessage<T>(
    sessionId: string,
    content: string,
    operation: (save: () => void) => T,
  ) {
    let savedPath: string | undefined;
    try {
      return runTransaction(this.db, () =>
        operation(() => {
          savedPath = new UserMessageStorage(resolveSessionPaths(sessionId).userMessagesDir).append(
            content,
          );
        }),
      );
    } catch (error) {
      if (savedPath) {
        new UserMessageStorage(resolveSessionPaths(sessionId).userMessagesDir).remove(savedPath);
      }
      throw error;
    }
  }
}
