import { type BaseMessage, ToolMessage } from "@langchain/core/messages";
import { type PersistedEventRow, persistedDisplayEvent } from "./timeline/persistedEvent";
import { contentToText, messageReasoning } from "../runtime/content";
import { queryAll, runTransaction } from "../infrastructure/database/connection";
import type { AgentDatabase } from "../infrastructure/database/agentDatabase";
import type { DisplayMessage } from "./timeline";
import type { QueueStatus } from "../types";
import { extractToolActivity } from "./timeline/tool/extraction";
import { extractToolImages } from "../runtime/multimodal";
import { loadFileLinkUnits } from "../infrastructure/database/records/fileLinks";
import { loadReasoningTranslations } from "../infrastructure/database/records/reasoningTranslations";
import { messageRowsToChatMessages } from "../infrastructure/database/records/messages/serialization";
import { modelTokenUsage } from "./timeline/tokenCounts";
import { openStoredSession } from "../storedSessions";
import { parseError } from "../failures/details";
import { prependInstructions } from "./timeline/build/instructions";
import { readDefinitionRecord } from "../infrastructure/database/records/sessions";
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
  submission_id: string | null;
}
export function loadSessionTranscript(sessionId: string) {
  using db = openStoredSession(sessionId);
  return loadTranscript(db, sessionId);
}
export function loadTranscript(db: AgentDatabase, sessionId: string) {
  return runTransaction(db.db, () => {
    const control = db.control(sessionId),
      transcriptRevision = db.transcriptRevision(sessionId),
      messages = prependInstructions(
        queryAll<MessageRow>(
          db.db,
          `SELECT m.id, m.source_id, m.message_json, m.queue_id, m.created_at
	       FROM messages m
	       WHERE m.session_id = ? AND m.position IS NOT NULL
	       ORDER BY m.position`,
          sessionId,
        ).map(toDisplayMessage),
        readDefinitionRecord(db.db, sessionId).prefix.systemPrompt,
      ),
      queue = queryAll<QueueRow>(
        db.db,
        `SELECT q.id, COALESCE(q.content, '') AS content, q.status, q.error,
	         m.id AS user_message_id, q.root_id, q.submission_id
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
        submissionId: row.submission_id,
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
    ...(ToolMessage.isInstance(message) ? { toolCallId: message.tool_call_id } : {}),
    ...extractToolActivity(message),
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
  if (message.type === "ai") {
    return "assistant";
  }
  if (message.type === "tool") {
    return "tool";
  }
  throw new Error(`不支持显示消息类型：${message.type}`);
}
