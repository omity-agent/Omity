import { requireSessionRecord, touchSessionRecord } from "./records/sessions";
import type { BaseMessage } from "@langchain/core/messages";
import type { Database } from "bun:sqlite";
import { appendUserQueue } from "./records/queue/operations";
import { prepareMessageSync } from "./records/messages/sync";
import { runTransaction } from "./connection";

export function initializeConversation(
  db: Database,
  sessionId: string,
  history: BaseMessage[],
  pendingUser: string,
) {
  requireSessionRecord(db, sessionId);
  return runTransaction(db, () => {
    prepareMessageSync(db, sessionId, history).commit();
    const queueId = appendUserQueue(db, sessionId, pendingUser);
    touchSessionRecord(db, sessionId);
    return queueId;
  });
}
