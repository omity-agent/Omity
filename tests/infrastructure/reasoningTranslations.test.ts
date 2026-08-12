import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, workspace } from "../support/database";
import { AIMessage } from "@langchain/core/messages";
import { loadTranscript } from "../../src/app/transcript";
import { storeReasoningTranslation } from "../../src/infrastructure/database/records/reasoningTranslations";

afterEach(cleanupDatabaseDirs);
test("reasoning translations persist and reject stale stream results", async () => {
  const db = makeDb(),
    sessionId = "translation-session";
  db.resetSession(sessionId, workspace);
  const queueId = db.appendUser(sessionId, "question");
  await db.appendStream(sessionId, {
    kind: "assistant_reasoning_delta",
    messageId: "assistant",
    partId: "reasoning",
    queueId,
    value: "first",
  });
  storeReasoningTranslation(db.db, sessionId, {
    messageId: "assistant",
    source: "first",
    targetLanguage: "zh-CN",
    translated: "首先",
  });
  await db.appendStream(sessionId, {
    kind: "assistant_reasoning_delta",
    messageId: "assistant",
    partId: "reasoning",
    queueId,
    value: " second",
  });
  expect(() =>
    storeReasoningTranslation(db.db, sessionId, {
      messageId: "assistant",
      source: "first",
      targetLanguage: "zh-CN",
      translated: "过期",
    }),
  ).toThrow("思维链原文已发生变化");
  storeReasoningTranslation(db.db, sessionId, {
    messageId: "assistant",
    source: "first second",
    targetLanguage: "zh-CN",
    translated: "首先，其次",
  });
  expect(loadTranscript(db, sessionId).reasoningTranslations).toEqual([
    {
      messageId: "assistant",
      source: "first second",
      targetLanguage: "zh-CN",
      translated: "首先，其次",
    },
  ]);
  db.close();
});
test("reasoning translations validate completed message source", async () => {
  const db = makeDb(),
    sessionId = "completed-translation";
  db.resetSession(sessionId, workspace);
  await db.syncHistory(sessionId, [
    new AIMessage({
      additional_kwargs: {
        aiSdkContent: [{ text: "analysis", type: "reasoning" }],
      },
      content: "answer",
      id: "assistant",
    }),
  ]);
  storeReasoningTranslation(db.db, sessionId, {
    messageId: "assistant",
    source: "analysis",
    targetLanguage: "zh-CN",
    translated: "分析",
  });
  expect(loadTranscript(db, sessionId).reasoningTranslations).toHaveLength(1);
  db.close();
});
