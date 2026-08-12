import { type BaseMessage, ToolMessage } from "@langchain/core/messages";
import { type DisplayMessage, type DisplayToolCall } from "./timeline";
import { type PersistedEventRow, persistedDisplayEvent } from "./timeline/persistedEvent";
import { contentToText, messageReasoning } from "../runtime/content";
import { freeformCallIds, rawFreeformInput } from "../runtime/freeform";
import { modelTokenUsage, toolInputTokens } from "./timeline/tokenCounts";
import { queryAll, runTransaction } from "../infrastructure/database/connection";
import { AgentDatabase } from "../infrastructure/database/agentDatabase";
import type { QueueStatus } from "../types";
import { existsSync } from "node:fs";
import { extractToolImages } from "../runtime/modelImages";
import { loadFileLinkUnits } from "../infrastructure/database/records/fileLinks";
import { loadReasoningTranslations } from "../infrastructure/database/records/reasoningTranslations";
import { messageRowsToChatMessages } from "../infrastructure/database/records/messages/serialization";
import { parseError } from "../failures/details";
import { resolveSessionPaths } from "../infrastructure/configuration/sessionPaths";
import { sessionNotFound } from "../errors";
import { toolOutputTokens } from "../runtime/toolOutput";

interface MessageRow {
  id: number;
  source_id: string;
  message_json: string;
  queue_id: number | null;
  created_at: number;
}
interface QueueRow {
  id: number;
  content: string;
  status: QueueStatus;
  error: string | null;
  user_message_id: number | null;
  root_id: number | null;
}
export function loadSessionTranscript(sessionId: string) {
  return withSessionDatabase(sessionId, (db) => loadTranscript(db, sessionId));
}
export function loadSessionEventCursor(sessionId: string) {
  return withSessionDatabase(sessionId, (db) => db.eventCursor());
}
function withSessionDatabase<T>(sessionId: string, read: (db: AgentDatabase) => T) {
  const paths = resolveSessionPaths(sessionId);
  if (!existsSync(paths.dbPath)) {
    throw sessionNotFound(sessionId);
  }
  const db = new AgentDatabase(paths.dbPath);
  try {
    return read(db);
  } finally {
    db.close();
  }
}
export function loadTranscript(db: AgentDatabase, sessionId: string) {
  return runTransaction(db.db, () => {
    const control = db.control(sessionId),
      transcriptRevision = db.transcriptRevision(sessionId),
      messages = queryAll<MessageRow>(
        db.db,
        `SELECT m.id, m.source_id, m.message_json, m.queue_id, m.created_at
       FROM messages m
       WHERE m.session_id = ? AND m.position IS NOT NULL
       ORDER BY m.position`,
        sessionId,
      ).map(toDisplayMessage),
      queue = queryAll<QueueRow>(
        db.db,
        `SELECT q.id, COALESCE(q.content, '') AS content, q.status, q.error,
         m.id AS user_message_id, q.root_id
       FROM queue q
       LEFT JOIN messages m ON m.queue_id = q.id
       WHERE q.session_id = ? ORDER BY q.id`,
        sessionId,
      ).map((row) => ({
        content: row.content,
        error: row.error ? parseError(row.error) : null,
        id: row.id,
        root: row.root_id === row.id,
        status: row.status,
        userMessageId: row.user_message_id,
      })),
      events = queryAll<PersistedEventRow>(
        db.db,
        `SELECT id, queue_id, message_id, part_id, kind, payload_json, file_links_json
       FROM events WHERE session_id = ? ORDER BY id`,
        sessionId,
      ).map(persistedDisplayEvent),
      fileLinks = loadFileLinkUnits(db.db, sessionId),
      reasoningTranslations = loadReasoningTranslations(db.db, sessionId),
      eventCursor = db.eventCursor();
    return {
      control,
      eventCursor,
      events,
      fileLinks,
      messages,
      queue,
      reasoningTranslations,
      transcriptRevision,
    };
  });
}
function toDisplayMessage(row: MessageRow): DisplayMessage {
  const [message] = messageRowsToChatMessages([row]);
  if (!message) {
    throw new Error("无法还原消息");
  }
  const role = messageRole(message),
    content = contentToText(message.content);
  if (role === "tool" && !ToolMessage.isInstance(message)) {
    throw new Error("工具消息类型无效");
  }
  return {
    id: row.id,
    ...(message.id ? { sourceId: message.id } : {}),
    content,
    images: extractToolImages(message.content),
    queueId: row.queue_id,
    reasoning: messageReasoning(message),
    role,
    toolCallId: extractToolCallId(message),
    toolCalls: extractToolCalls(message),
    ...(ToolMessage.isInstance(message)
      ? { outputTokens: toolOutputTokens(message, content) }
      : {}),
    createdAt: row.created_at,
    usage: modelTokenUsage(message),
  };
}
function messageRole(message: BaseMessage): DisplayMessage["role"] {
  if (message.type === "human") {
    return "user";
  }
  if (message.type === "tool") {
    return "tool";
  }
  return "assistant";
}
function extractToolCalls(message: BaseMessage): DisplayToolCall[] {
  const calls = readRecordArray(message, "tool_calls"),
    freeformIds = freeformCallIds(message);
  return calls.map((call, index) => {
    const input = call["args"] ?? call["input"] ?? call,
      callId = stringField(call, "id"),
      id = callId ?? `tool-${index.toString()}`,
      freeform = call["isCustomTool"] === true || freeformIds.has(id),
      toolCall: DisplayToolCall = {
        id,
        index,
        input,
        inputTokens: toolInputTokens(call, input),
        name: stringField(call, "name") ?? "tool",
      };
    if (!callId) {
      toolCall.temporary = true;
    }
    if (message.id) {
      toolCall.messageId = message.id;
    }
    if (freeform) {
      toolCall.rawInput = rawFreeformInput(input);
    }
    return toolCall;
  });
}
function extractToolCallId(message: BaseMessage) {
  const value = readRecord(message, "tool_call_id");
  return typeof value === "string" ? value : undefined;
}
function readRecordArray(message: BaseMessage, key: string) {
  const value = hasProperty(message, key) ? message[key] : undefined;
  return Array.isArray(value) ? value.filter(isRecord) : [];
}
function readRecord(message: BaseMessage, key: string) {
  return hasProperty(message, key) ? message[key] : undefined;
}
function stringField(record: Record<string, unknown>, key: string) {
  return typeof record[key] === "string" ? record[key] : undefined;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function hasProperty<Key extends PropertyKey>(
  value: object,
  key: Key,
): value is object & Record<Key, unknown> {
  return key in value;
}
