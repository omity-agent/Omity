import { cachedQuery, queryAll, runTransaction } from "../infrastructure/database/sqlite/connection";
import { inputMessageId, storeMessage } from "../infrastructure/database/records/transcript/messages/history";
import type { AgentDatabase } from "../infrastructure/database/agentDatabase";
import type { Database } from "bun:sqlite";
import { DomainError } from "../errors";
import { contentToText } from "../runtime/content";
import { copyHookUsage } from "../hooks/storage/usage";
import { createRunRecord } from "../infrastructure/database/records/execution/transitions";
import { isPlainObject as isRecord } from "es-toolkit";
import { messageRowsToChatMessages } from "../infrastructure/database/records/transcript/messages/serialization";
import { randomUUID } from "node:crypto";
import { readDefinitionRecord } from "../infrastructure/database/records/session/metadata";
import { writeComposerDraftRecord } from "../infrastructure/database/records/session/composerDrafts";

interface MessageRow {
  id: number;
  source_id: string;
  message_json: string;
  position: number;
  created_at: number;
  token_count: number | null;
}
interface ForkOptions {
  source: AgentDatabase;
  target: AgentDatabase;
  sourceSessionId: string;
  targetSessionId: string;
  workspace: string;
  profiles: string[];
  beforeMessageId: number;
}
export function forkDatabaseBeforeMessage(options: ForkOptions) {
  const forkPoint = assertForkPoint(
      options.source.db,
      options.sourceSessionId,
      options.beforeMessageId,
    ),
    messages = forkMessages(options.source.db, options.sourceSessionId, forkPoint.position);
  if (!messages.some((message) => storedMessageType(message.message_json) === "human")) {
    throw new Error("每个 session 的第一条用户消息不能 Fork");
  }
  runTransaction(options.target.db, () => {
    options.target.createSession(
      options.targetSessionId,
      options.workspace,
      options.profiles,
      readDefinitionRecord(options.source.db, options.sourceSessionId),
      "pause",
    );
    insertMessages(options.target.db, options.targetSessionId, messages);
    copyHookUsage(
      options.source.db,
      options.sourceSessionId,
      options.target.db,
      options.targetSessionId,
    );
    const content = messageContent(forkPoint.message_json);
    writeComposerDraftRecord(options.target.db, options.targetSessionId, content, 1);
  });
}
function assertForkPoint(db: Database, sessionId: string, messageId: number) {
  if (!Number.isSafeInteger(messageId) || messageId <= 0) {
    throw new Error(`Fork 消息 ID 无效：${messageId.toString()}`);
  }
  const row = cachedQuery<MessageRow>(
    db,
    `SELECT m.id, m.source_id, m.message_json, m.position, m.created_at, m.token_count
	     FROM messages m
	     WHERE m.session_id = ? AND m.id = ? AND m.position IS NOT NULL`,
  ).get(sessionId, messageId);
  if (!row) {
    throw new DomainError("FORK_MESSAGE_NOT_FOUND", `Fork 消息不存在：${messageId.toString()}`);
  }
  if (storedMessageType(row.message_json) !== "human") {
    throw new Error("只能从用户消息创建 Fork");
  }
  return row;
}
function forkMessages(db: Database, sessionId: string, beforePosition: number) {
  return queryAll<MessageRow>(
    db,
    `SELECT m.id, m.source_id, m.message_json, m.position, m.created_at, m.token_count
	     FROM messages m
	     WHERE m.session_id = ? AND m.position < ? ORDER BY m.position`,
    sessionId,
    beforePosition,
  );
}
function insertMessages(db: Database, sessionId: string, messages: MessageRow[]) {
  const lastUserIndex = messages.findLastIndex(
      (message) => storedMessageType(message.message_json) === "human",
    ),
    lastUser = messages[lastUserIndex];
  if (!lastUser) {
    throw new Error("Fork 历史缺少用户输入");
  }
  const runId = createRunRecord(db, sessionId, "paused"),
    inputId = Number(
      db.run(
        `INSERT INTO inputs (session_id, run_id, ordinal, content, delivery)
       VALUES (?, ?, 0, ?, 'consumed')`,
        [sessionId, runId, messageContent(lastUser.message_json)],
      ).lastInsertRowid,
    );
  for (const [position, message] of messages.entries()) {
    const [chatMessage] = messageRowsToChatMessages([message]);
    if (!chatMessage) {
      throw new Error("无法还原 Fork 消息");
    }
    const continuation = position === lastUserIndex;
    chatMessage.id = continuation ? inputMessageId(sessionId, inputId) : randomUUID();
    storeMessage(
      db,
      sessionId,
      chatMessage,
      position,
      continuation ? inputId : undefined,
      message.created_at,
    );
  }
}
function storedMessageType(value: string) {
  const parsed = JSON.parse(value) as unknown;
  if (!isRecord(parsed) || typeof parsed["type"] !== "string") {
    throw new Error("消息记录无效");
  }
  return parsed["type"];
}
function messageContent(value: string) {
  const [message] = messageRowsToChatMessages([{ message_json: value }]);
  if (!message) {
    throw new Error("无法还原 Fork 消息");
  }
  return contentToText(message.content);
}
