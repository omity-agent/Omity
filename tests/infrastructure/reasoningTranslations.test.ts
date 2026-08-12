import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, workspace } from "../support/database";
import { AIMessage } from "@langchain/core/messages";
import { loadTranscript } from "../../src/app/transcript";
import { storeReasoningTranslation } from "../../src/infrastructure/database/records/reasoningTranslations";

afterEach(cleanupDatabaseDirs);
test("reasoning translations only persist completed messages", async () => {
  const db = makeDb(),
    sessionId = "translation-session";
  db.resetSession(sessionId, workspace);
  expect(() =>
    storeReasoningTranslation(db.db, sessionId, {
      messageId: "assistant",
      source: "first",
      targetLanguage: "zh-CN",
      translated: "首先",
    }),
  ).toThrow("思维链消息不存在");
  await db.syncHistory(sessionId, [
    new AIMessage({
      additional_kwargs: {
        aiSdkContent: [{ text: "analysis", type: "reasoning" }],
      },
      content: "answer",
      id: "assistant",
    }),
  ]);
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
    source: "analysis",
    targetLanguage: "zh-CN",
    translated: "分析",
  });
  expect(loadTranscript(db, sessionId).reasoningTranslations).toEqual([
    {
      messageId: "assistant",
      source: "analysis",
      targetLanguage: "zh-CN",
      translated: "分析",
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
