import { requireSessionRecord, touchSessionRecord } from "../records/session/metadata";
import type { BaseMessage } from "@langchain/core/messages";
import type { Database } from "bun:sqlite";
import { enqueueInputRecord } from "../records/execution/queue/admission";
import { prepareMessageSync } from "../records/transcript/messages/sync";
import { runTransaction } from "../sqlite/connection";

export function initializeConversation(
  db: Database,
  sessionId: string,
  history: BaseMessage[],
  pendingUser: string,
) {
  requireSessionRecord(db, sessionId);
  return runTransaction(db, () => {
    prepareMessageSync(db, sessionId, history).commit();
    const inputId = enqueueInputRecord(db, sessionId, pendingUser);
    touchSessionRecord(db, sessionId);
    return inputId;
  });
}
