import { type BaseMessage, ToolMessage } from "@langchain/core/messages";
import { type PersistedEventRow, persistedDisplayEvent } from "./timeline/persistedEvent";
import { contentToText, messageReasoning } from "../runtime/content";
import { messageContentParts, messageContentToText } from "../runtime/modelContent";
import { queryAll, runTransaction } from "../infrastructure/database/sqlite/connection";
import type { AgentDatabase } from "../infrastructure/database/agentDatabase";
import type { DisplayMessage } from "./timeline";
import { extractToolActivity } from "./timeline/tool/extraction";
import { extractToolImages } from "../runtime/multimodal";
import { loadFileLinkUnits } from "../infrastructure/database/records/transcript/fileLinks";
import { loadReasoningTranslations } from "../infrastructure/database/records/transcript/reasoningTranslations";
import { messageRowsToChatMessages } from "../infrastructure/database/records/transcript/messages/serialization";
import { modelTokenUsage } from "./timeline/tokenCounts";
import { openStoredSession } from "../storedSessions";
import { prependInstructions } from "./timeline/build/instructions";
import { readDefinitionRecord } from "../infrastructure/database/records/session/metadata";
import { toolOutputTokens } from "../runtime/toolOutput";
import { transcriptInputRows } from "../infrastructure/database/records/execution/queue/workItems";

interface MessageRow {
  id: number;
  source_id: string;
  message_json: string;
  input_id: number | null;
  created_at: number;
  token_count: number | null;
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
          `SELECT m.id, m.source_id, m.message_json, m.input_id, m.created_at, m.token_count
	       FROM messages m
	       WHERE m.session_id = ? AND m.position IS NOT NULL
	       ORDER BY m.position`,
          sessionId,
        ).map(toDisplayMessage),
        readDefinitionRecord(db.db, sessionId).prefix.systemPrompt,
      ),
      queue = transcriptInputRows(db.db, sessionId),
      events = queryAll<PersistedEventRow>(
        db.db,
        `SELECT id, input_id, message_id, part_id, kind, payload_json, file_links_json
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
    contentParts = message.type === "ai" ? messageContentParts(message) : undefined,
    content = contentParts?.join("") ?? contentToText(message.content),
    copyContent = message.type === "ai" ? messageContentToText(message) : content;
  if (role === "tool" && !ToolMessage.isInstance(message)) {
    throw new Error("工具消息类型无效");
  }
  return {
    id: row.id,
    ...(message.id ? { sourceId: message.id } : {}),
    content,
    ...(copyContent === content ? {} : { copyContent }),
    ...(contentParts && contentParts.length > 0 ? { contentParts } : {}),
    images: extractToolImages(message.content),
    inputId: row.input_id,
    reasoning: messageReasoning(message),
    role,
    ...(ToolMessage.isInstance(message) ? { toolCallId: message.tool_call_id } : {}),
    ...extractToolActivity(message),
    ...(ToolMessage.isInstance(message)
      ? { outputTokens: toolOutputTokens(message, content) }
      : {}),
    createdAt: row.created_at,
    tokenCount: row.token_count,
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
