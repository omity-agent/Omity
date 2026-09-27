import { requireSessionRecord, touchSessionRecord } from "../session/metadata";
import type { Database } from "bun:sqlite";
import { UserMessageStorage } from "../../session/userMessages";
import { clearComposerDraftRecord } from "../session/composerDrafts";
import { enqueueInputRecord } from "./queue/admission";
import { resolveSessionPaths } from "../../../configuration/sessionPaths";
import { runTransaction } from "../../sqlite/connection";

export class InputSubmissionStore {
  constructor(private readonly db: Database) {}
  appendUser(sessionId: string, content: string) {
    requireSessionRecord(this.db, sessionId);
    return this.saveUserMessage(sessionId, content, (save) => {
      const inputId = enqueueInputRecord(this.db, sessionId, content);
      save();
      touchSessionRecord(this.db, sessionId);
      return inputId;
    });
  }
  submitUser(sessionId: string, content: string, draftRevision: number, submissionId: string) {
    requireSessionRecord(this.db, sessionId);
    return this.saveUserMessage(sessionId, content, (save) => {
      const inputId = enqueueInputRecord(this.db, sessionId, content, submissionId);
      clearComposerDraftRecord(this.db, sessionId, draftRevision);
      save();
      touchSessionRecord(this.db, sessionId);
      return inputId;
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
