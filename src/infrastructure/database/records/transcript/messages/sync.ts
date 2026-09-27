import { type MessageInsert, messageInsert } from "./serialization";
import { messageInputId, storePreparedMessage } from "./history";
import { messageMutations, pruneUnreferencedMessages } from "./writing";
import type { BaseMessage } from "@langchain/core/messages";
import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { transcriptMessageRows } from "../../../projections/transcriptRows";

export function prepareMessageSync(db: Database, sessionId: string, messages: BaseMessage[]) {
  const items = messages.map((message) => {
      message.id ??= randomUUID();
      return { message, stored: messageInsert(message) };
    }),
    existing = transcriptMessageRows(db, sessionId),
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
      messageMutations(db).detach.run({ position: changedAt, sessionId });
      for (let position = changedAt; position < items.length; position += 1) {
        const item = items[position]!;
        storePreparedMessage(
          db,
          sessionId,
          item.stored,
          position,
          messageInputId(sessionId, item.message),
        );
      }
      pruneUnreferencedMessages(db, sessionId);
    },
  };
}
function firstChangedIndex(
  existing: ReturnType<typeof transcriptMessageRows>,
  incoming: MessageInsert[],
) {
  const length = Math.min(existing.length, incoming.length);
  for (let index = 0; index < length; index += 1) {
    const before = existing[index],
      after = incoming[index];
    if (
      !before ||
      !after ||
      before.sourceId !== after.sourceId ||
      before.messageJson !== after.messageJson
    ) {
      return index;
    }
  }
  return length;
}
