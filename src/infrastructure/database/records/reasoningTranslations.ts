import { eq, sql } from "drizzle-orm";
import type { Database } from "bun:sqlite";
import { messageReasoning } from "../../../runtime/content";
import { messageRowsToChatMessages } from "./messages/serialization";
import { reasoningTranslations } from "../schema";
import { sessionDatabase } from "../connection";

export interface ReasoningTranslation {
  messageId: string;
  source: string;
  targetLanguage: string;
  translated: string;
}
export function loadReasoningTranslations(db: Database, sessionId: string): ReasoningTranslation[] {
  return sessionDatabase(db)
    .select({
      messageId: reasoningTranslations.messageId,
      source: reasoningTranslations.source,
      targetLanguage: reasoningTranslations.targetLanguage,
      translated: reasoningTranslations.translated,
    })
    .from(reasoningTranslations)
    .where(eq(reasoningTranslations.sessionId, sessionId))
    .all();
}
export function storeReasoningTranslation(
  db: Database,
  sessionId: string,
  translation: ReasoningTranslation,
) {
  const source = currentReasoningSource(db, sessionId, translation.messageId);
  if (source !== translation.source) {
    throw new Error(`思维链原文已发生变化：${translation.messageId}`);
  }
  sessionDatabase(db)
    .insert(reasoningTranslations)
    .values({
      ...translation,
      sessionId,
      updatedAt: sql`unixepoch()`,
    })
    .onConflictDoUpdate({
      set: {
        source: translation.source,
        translated: translation.translated,
        updatedAt: sql`unixepoch()`,
      },
      target: [
        reasoningTranslations.sessionId,
        reasoningTranslations.messageId,
        reasoningTranslations.targetLanguage,
      ],
    })
    .run();
}
function currentReasoningSource(db: Database, sessionId: string, messageId: string) {
  const events = db
    .query<{ payload_json: string }, [string, string]>(
      `SELECT payload_json FROM events
       WHERE session_id = ? AND message_id = ?
         AND kind = 'assistant_reasoning_delta'
       ORDER BY id`,
    )
    .all(sessionId, messageId);
  if (events.length > 0) {
    return events
      .map(({ payload_json: payload }) => {
        const value = JSON.parse(payload) as unknown;
        if (typeof value !== "string") {
          throw new Error(`思维链流事件无效：${messageId}`);
        }
        return value;
      })
      .join("");
  }
  const message = db
    .query<{ message_json: string }, [string, string]>(
      `SELECT message_json FROM messages
       WHERE session_id = ? AND source_id = ? AND position IS NOT NULL`,
    )
    .get(sessionId, messageId);
  if (!message) {
    throw new Error(`思维链消息不存在：${messageId}`);
  }
  const [restored] = messageRowsToChatMessages([{ ...message, source_id: messageId }]);
  if (!restored) {
    throw new Error(`思维链消息无法还原：${messageId}`);
  }
  return messageReasoning(restored);
}
