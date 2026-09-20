import { type MessageInsert, messageInsert } from "./serialization";
import { messageQueueId, pruneUnreferencedMessages, storePreparedMessage } from "./history";
import type { BaseMessage } from "@langchain/core/messages";
import type { Database } from "bun:sqlite";
import { queryAll } from "../../connection";
import { randomUUID } from "node:crypto";

interface StoredRow {
  message_json: string;
  source_id: string;
}
export function prepareMessageSync(db: Database, sessionId: string, messages: BaseMessage[]) {
  const items = messages.map((message) => {
      message.id ??= randomUUID();
      return { message, stored: messageInsert(message) };
    }),
    existing = queryAll<StoredRow>(
      db,
      `SELECT source_id, message_json FROM messages
     WHERE session_id = ? AND position IS NOT NULL ORDER BY position`,
      sessionId,
    ),
    changedAt = firstChangedIndex(
      existing,
      items.map((item) => item.stored),
    ),
    changed = changedAt !== items.length || changedAt !== existing.length;
  return {
    changed,
    commit: () => {
      if (!changed) {
        return;
      }
      db.run(
        `UPDATE messages SET position = NULL, queue_id = NULL
         WHERE session_id = ? AND position >= ?`,
        [sessionId, changedAt],
      );
      for (let position = changedAt; position < items.length; position += 1) {
        const item = items[position]!;
        storePreparedMessage(
          db,
          sessionId,
          item.stored,
          position,
          messageQueueId(sessionId, item.message),
        );
      }
      pruneUnreferencedMessages(db, sessionId);
    },
  };
}
function firstChangedIndex(existing: StoredRow[], incoming: MessageInsert[]) {
  const length = Math.min(existing.length, incoming.length);
  for (let index = 0; index < length; index += 1) {
    const before = existing[index],
      after = incoming[index];
    if (
      !before ||
      !after ||
      before.source_id !== after.sourceId ||
      before.message_json !== after.messageJson
    ) {
      return index;
    }
  }
  return length;
}
