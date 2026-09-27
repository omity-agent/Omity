import { AIMessage, type BaseMessage, HumanMessage } from "@langchain/core/messages";
import { type MessageStorageMode, messageInsert } from "./serialization";
import type { Database } from "bun:sqlite";
import { decodeMessage } from "./hydration";
import { messageMutations } from "./writing";
import { randomUUID } from "node:crypto";
import { transcriptMessageRows } from "../../../projections/transcriptRows";

export function insertUserMessage(
  db: Database,
  sessionId: string,
  content: string,
  inputId: number,
) {
  return storeMessage(
    db,
    sessionId,
    new HumanMessage({ content, id: inputMessageId(sessionId, inputId) }),
    nextPosition(db, sessionId),
    inputId,
  );
}
export function inputMessageId(sessionId: string, inputId: number) {
  return `input:${sessionId}:${inputId.toString()}`;
}
export function messageInputId(sessionId: string, message: BaseMessage) {
  if (message.type !== "human" || !message.id) {
    return undefined;
  }
  const prefix = `input:${sessionId}:`;
  if (!message.id.startsWith("input:")) {
    return undefined;
  }
  if (!message.id.startsWith(prefix)) {
    throw new Error(`用户消息属于其他会话：${message.id}`);
  }
  const inputId = Number(message.id.slice(prefix.length));
  if (!Number.isSafeInteger(inputId) || inputId <= 0) {
    throw new Error(`用户消息 Queue ID 无效：${message.id}`);
  }
  return inputId;
}
export function appendAssistantMessage(db: Database, sessionId: string, content: string) {
  storeMessage(
    db,
    sessionId,
    new AIMessage({ content, id: randomUUID() }),
    nextPosition(db, sessionId),
  );
}
export function loadMessages(db: Database, sessionId: string): BaseMessage[] {
  return transcriptMessageRows(db, sessionId).map((row) =>
    decodeMessage(row.messageJson, row.sourceId),
  );
}
export function storeMessage(
  db: Database,
  sessionId: string,
  message: BaseMessage,
  position?: number,
  inputId?: number,
  createdAt?: number,
  mode: MessageStorageMode = "history",
) {
  message.id ??= randomUUID();
  return storePreparedMessage(
    db,
    sessionId,
    messageInsert(message, mode),
    position,
    inputId,
    createdAt,
  );
}
export function storePreparedMessage(
  db: Database,
  sessionId: string,
  item: ReturnType<typeof messageInsert>,
  position?: number,
  inputId?: number,
  createdAt?: number,
) {
  const row = messageMutations(db).store.get({
    ...item,
    createdAt: createdAt ?? null,
    inputId: inputId ?? null,
    position: position ?? null,
    sessionId,
  });
  if (inputId !== undefined) {
    messageMutations(db).consume.run({ inputId, sessionId });
  }
  return row.id;
}
function nextPosition(db: Database, sessionId: string) {
  const row = messageMutations(db).nextPosition.get({ sessionId });
  if (!row) {
    throw new Error("无法分配消息位置");
  }
  return row.position;
}
