import { appendDraftQueue, appendUserQueue } from "./operations";
import { dirname, resolve } from "node:path";
import { requireSessionRecord, touchSessionRecord } from "../sessions";
import type { Database } from "bun:sqlite";
import { UserMessageStorage } from "../../userMessages";
import { clearComposerDraftRecord } from "../composerDrafts";
import { runTransaction } from "../../connection";

export class QueueSubmissionStore {
  private readonly userMessages: UserMessageStorage;
  constructor(
    private readonly db: Database,
    databasePath: string,
  ) {
    this.userMessages = new UserMessageStorage(resolve(dirname(databasePath), "user_messages"));
  }
  appendUser(sessionId: string, content: string) {
    requireSessionRecord(this.db, sessionId);
    return this.saveUserMessage(content, (save) => {
      const queueId = appendUserQueue(this.db, sessionId, content);
      save();
      touchSessionRecord(this.db, sessionId);
      return queueId;
    });
  }
  submitUser(sessionId: string, content: string, draftRevision: number, submissionId: string) {
    requireSessionRecord(this.db, sessionId);
    return this.saveUserMessage(content, (save) => {
      const queueId = appendUserQueue(this.db, sessionId, content, submissionId);
      clearComposerDraftRecord(this.db, sessionId, draftRevision);
      save();
      touchSessionRecord(this.db, sessionId);
      return queueId;
    });
  }
  appendDraft(sessionId: string, content: string) {
    requireSessionRecord(this.db, sessionId);
    return runTransaction(this.db, () => {
      const queueId = appendDraftQueue(this.db, sessionId, content);
      touchSessionRecord(this.db, sessionId);
      return queueId;
    });
  }
  private saveUserMessage<T>(content: string, operation: (save: () => void) => T) {
    let savedPath: string | undefined;
    try {
      return runTransaction(this.db, () =>
        operation(() => {
          savedPath = this.userMessages.append(content);
        }),
      );
    } catch (error) {
      if (savedPath) {
        this.userMessages.remove(savedPath);
      }
      throw error;
    }
  }
}
