import { type BaseMessage, ToolMessage } from "@langchain/core/messages";
import { contentToText, messageReasoning } from "../runtime/content";
import { messageContentParts, messageContentToText } from "../runtime/modelContent";
import {
  readControlRecord,
  readDefinitionRecord,
  readTranscriptRevisionRecord,
} from "../infrastructure/database/records/session/metadata";
import {
  transcriptEvents,
  transcriptMessageRows,
} from "../infrastructure/database/projections/transcriptRows";
import type { Database } from "bun:sqlite";
import type { DisplayMessage } from "./timeline";
import { decodeMessage } from "../infrastructure/database/records/transcript/messages/hydration";
import { extractToolActivity } from "./timeline/tool/extraction";
import { extractToolImages } from "../runtime/multimodal";
import { loadFileLinkUnits } from "../infrastructure/database/records/transcript/fileLinks";
import { loadReasoningTranslations } from "../infrastructure/database/records/transcript/reasoningTranslations";
import { localize } from "../i18n/server";
import { modelTokenUsage } from "./timeline/tokenCounts";
import { prependInstructions } from "./timeline/build/instructions";
import { runTransaction } from "../infrastructure/database/sqlite/connection";
import { streamEventCursor } from "../infrastructure/database/records/transcript/streamEvents";
import { toolOutputTokens } from "../runtime/toolOutput";
import { transcriptInputRows } from "../infrastructure/database/records/execution/queue/workItems";

export function loadTranscript(db: Database, sessionId: string) {
  return runTransaction(db, () => {
    const control = readControlRecord(db, sessionId),
      transcriptRevision = readTranscriptRevisionRecord(db, sessionId),
      messages = prependInstructions(
        transcriptMessageRows(db, sessionId).map(toDisplayMessage),
        readDefinitionRecord(db, sessionId).prefix.systemPrompt,
      ),
      queue = transcriptInputRows(db, sessionId),
      events = transcriptEvents(db, sessionId),
      fileLinks = loadFileLinkUnits(db, sessionId),
      reasoningTranslations = loadReasoningTranslations(db, sessionId),
      eventCursor = streamEventCursor(db);
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
function toDisplayMessage(row: ReturnType<typeof transcriptMessageRows>[number]): DisplayMessage {
  const message = decodeMessage(row.messageJson, row.sourceId),
    role = messageRole(message),
    contentParts = message.type === "ai" ? messageContentParts(message) : undefined,
    content = contentParts?.join("") ?? contentToText(message.content),
    copyContent = message.type === "ai" ? messageContentToText(message) : content;
  if (role === "tool" && !ToolMessage.isInstance(message)) {
    throw new Error(localize("application:transcript.toolMessageInvalid"));
  }
  return {
    id: row.id,
    ...(message.id ? { sourceId: message.id } : {}),
    content,
    ...(copyContent === content ? {} : { copyContent }),
    ...(contentParts && contentParts.length > 0 ? { contentParts } : {}),
    images: extractToolImages(message.content),
    inputId: row.inputId,
    reasoning: messageReasoning(message),
    role,
    ...(ToolMessage.isInstance(message) ? { toolCallId: message.tool_call_id } : {}),
    ...extractToolActivity(message),
    ...(ToolMessage.isInstance(message)
      ? { outputTokens: toolOutputTokens(message, content) }
      : {}),
    createdAt: row.createdAt,
    tokenCount: row.tokenCount,
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
  throw new Error(
    localize("application:transcript.messageTypeUnsupported", { value0: message.type }),
  );
}
