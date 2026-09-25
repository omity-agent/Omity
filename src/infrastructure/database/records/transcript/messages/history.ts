import { AIMessage, type BaseMessage, HumanMessage } from "@langchain/core/messages";
import { type MessageStorageMode, messageInsert, messageRowsToChatMessages } from "./serialization";
import { cachedQuery, queryAll } from "../../../sqlite/connection";
import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";

interface StoredRow {
  message_json: string;
  source_id: string;
}
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
  const rows = queryAll<StoredRow>(
    db,
    `SELECT source_id, message_json FROM messages
     WHERE session_id = ? AND position IS NOT NULL ORDER BY position`,
    sessionId,
  );
  return messageRowsToChatMessages(rows);
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
export function pruneUnreferencedMessages(db: Database, sessionId?: string) {
  db.run(
    `DELETE FROM messages
     WHERE position IS NULL
       AND (? IS NULL OR session_id = ?)`,
    [sessionId ?? null, sessionId ?? null],
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
  const row = cachedQuery<{ id: number }>(
    db,
    `INSERT INTO messages
       (session_id, source_id, message_json, input_id, position, created_at, token_count)
     VALUES (?, ?, ?, ?, ?, COALESCE(?, unixepoch()), ?)
     ON CONFLICT(session_id, source_id) DO UPDATE SET
       message_json = excluded.message_json,
       input_id = COALESCE(excluded.input_id, messages.input_id),
       position = COALESCE(excluded.position, messages.position),
       token_count = excluded.token_count
     RETURNING id`,
  ).get(
    sessionId,
    item.sourceId,
    item.messageJson,
    inputId ?? null,
    position ?? null,
    createdAt ?? null,
    item.tokenCount,
  );
  if (!row) {
    throw new Error(`消息写入失败：${item.sourceId}`);
  }
  if (inputId !== undefined) {
    db.run(
      "UPDATE inputs SET delivery = 'consumed' WHERE id = ? AND session_id = ? AND delivery = 'pending'",
      [inputId, sessionId],
    );
  }
  return row.id;
}
function nextPosition(db: Database, sessionId: string) {
  const row = cachedQuery<{ position: number }>(
    db,
    "SELECT COALESCE(MAX(position), -1) + 1 AS position FROM messages WHERE session_id = ?",
  ).get(sessionId);
  if (!row) {
    throw new Error("无法分配消息位置");
  }
  return row.position;
}
