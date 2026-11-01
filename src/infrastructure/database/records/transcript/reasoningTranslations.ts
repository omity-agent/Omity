import type { Database } from "bun:sqlite";

import { and, eq, sql } from "drizzle-orm";

import { messageReasoning } from "../../../../runtime/content";
import { messages, reasoningTranslations } from "../../schema";
import { sessionDatabase } from "../../sqlite/connection";
import { decodeMessage } from "./messages/hydration";

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
      messageJson: sql<string>`${messages.message}`,
      targetLanguage: reasoningTranslations.targetLanguage,
      translated: reasoningTranslations.translated,
    })
    .from(reasoningTranslations)
    .innerJoin(
      messages,
      and(
        eq(messages.sessionId, reasoningTranslations.sessionId),
        eq(messages.sourceId, reasoningTranslations.messageId),
      ),
    )
    .where(eq(reasoningTranslations.sessionId, sessionId))
    .all()
    .map(({ messageJson, ...translation }) =>
      Object.assign(translation, {
        source: messageReasoning(decodeMessage(messageJson, translation.messageId)),
      }),
    );
}
export function storeReasoningTranslation(
  db: Database,
  sessionId: string,
  translation: ReasoningTranslation,
) {
  sessionDatabase(db)
    .insert(reasoningTranslations)
    .values({
      messageId: translation.messageId,
      sessionId,
      targetLanguage: translation.targetLanguage,
      translated: translation.translated,
    })
    .onConflictDoUpdate({
      set: {
        translated: translation.translated,
      },
      target: [
        reasoningTranslations.sessionId,
        reasoningTranslations.messageId,
        reasoningTranslations.targetLanguage,
      ],
    })
    .run();
}
