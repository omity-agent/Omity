import {
  cachedQuery,
  queryAll,
  runTransaction,
} from "../infrastructure/database/sqlite/connection";
import {
  inputMessageId,
  storeMessage,
} from "../infrastructure/database/records/transcript/messages/history";
import type { AgentDatabase } from "../infrastructure/database/agentDatabase";
import type { Database } from "bun:sqlite";
import { DomainError } from "../errors";
import { HumanMessage } from "@langchain/core/messages";
import { contentToText } from "../runtime/content";
import { copyHookUsage } from "../hooks/storage/usage";
import { createRunRecord } from "../infrastructure/database/records/execution/runs/mutations";
import { decodeMessage } from "../infrastructure/database/records/transcript/messages/hydration";
import { isPlainObject as isRecord } from "es-toolkit";
import { localize } from "../i18n/server";
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
    messages = forkMessages(options.source.db, options.sourceSessionId, forkPoint.position).map(
      (row) => ({ message: decodeMessage(row.message_json, row.source_id), row }),
    ),
    userMessages = runTransaction(options.target.db, () => {
      options.target.createSession(
        options.targetSessionId,
        options.workspace,
        options.profiles,
        readDefinitionRecord(options.source.db, options.sourceSessionId),
        "pause",
      );
      const copiedUserMessages = insertMessages(
        options.target.db,
        options.targetSessionId,
        messages,
      );
      copyHookUsage(
        options.source.db,
        options.sourceSessionId,
        options.target.db,
        options.targetSessionId,
      );
      const content = messageContent(forkPoint.message_json);
      writeComposerDraftRecord(options.target.db, options.targetSessionId, content, 0);
      return copiedUserMessages;
    });
  return userMessages;
}
function assertForkPoint(db: Database, sessionId: string, messageId: number) {
  if (!Number.isSafeInteger(messageId) || messageId <= 0) {
    throw new Error(
      localize("application:fork.messageIdInvalid", { value0: messageId.toString() }),
    );
  }
  const row = cachedQuery<MessageRow>(
    db,
    `SELECT m.id, m.source_id, m.message_json, m.position, m.created_at, m.token_count
	     FROM messages m
	     WHERE m.session_id = ? AND m.id = ? AND m.position IS NOT NULL`,
  ).get(sessionId, messageId);
  if (!row) {
    throw new DomainError(
      "FORK_MESSAGE_NOT_FOUND",
      localize("application:fork.messageMissing", { value0: messageId.toString() }),
    );
  }
  if (storedMessageType(row.message_json) !== "human") {
    throw new Error(localize("application:fork.userMessageRequired"));
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
function insertMessages(
  db: Database,
  sessionId: string,
  messages: { row: MessageRow; message: ReturnType<typeof decodeMessage> }[],
) {
  const lastUserIndex = messages.findLastIndex(({ message }) => HumanMessage.isInstance(message)),
    lastUser = messages[lastUserIndex]?.message;
  if (!lastUser) {
    throw new Error(localize("application:fork.userInputMissing"));
  }
  const runId = createRunRecord(db, sessionId, "paused"),
    inputId = Number(
      db.run(
        `INSERT INTO inputs (session_id, run_id, ordinal, content, delivery)
       VALUES (?, ?, 0, ?, 'consumed')`,
        [sessionId, runId, contentToText(lastUser.content)],
      ).lastInsertRowid,
    ),
    userMessages: string[] = [];
  for (const [position, message] of messages.entries()) {
    const chatMessage = message.message,
      continuation = position === lastUserIndex;
    chatMessage.id = continuation ? inputMessageId(sessionId, inputId) : randomUUID();
    storeMessage(
      db,
      sessionId,
      chatMessage,
      position,
      continuation ? inputId : undefined,
      message.row.created_at,
    );
    if (HumanMessage.isInstance(chatMessage)) {
      userMessages.push(contentToText(chatMessage.content));
    }
  }
  return userMessages;
}
function storedMessageType(value: string) {
  const parsed = JSON.parse(value) as unknown;
  if (!isRecord(parsed) || typeof parsed["type"] !== "string") {
    throw new Error(localize("application:fork.messageInvalid"));
  }
  return parsed["type"];
}
function messageContent(value: string) {
  return contentToText(decodeMessage(value).content);
}
