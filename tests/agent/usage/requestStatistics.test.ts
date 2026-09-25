import { expect, test } from "bun:test";
import { HumanMessage } from "@langchain/core/messages";
import { MockLanguageModelV4 } from "ai/test";
import { decodeMessage } from "../../../src/infrastructure/database/records/transcript/messages/hydration";
import { estimateCacheHitRate } from "../../../src/agent/model/cacheExpectation";
import { messageInsert } from "../../../src/infrastructure/database/records/transcript/messages/serialization";
import { modelTokenUsage } from "../../../src/app/timeline/tokenCounts";
import { simulateReadableStream } from "ai";
import { streamAiModel } from "../../../src/agent/model/request";
import { testSettings } from "../../support/settings";
import { toModelMessages } from "../../../src/agent/aiMessages";

test("request estimates stay paired with returned usage through persistence", async () => {
  let request = 0;
  const model = new MockLanguageModelV4({
      doStream: async () => {
        request += 1;
        return {
          stream: simulateReadableStream({
            chunks: [
              {
                id: `response-${request}`,
                modelId: "mock",
                timestamp: new Date(0),
                type: "response-metadata",
              },
              { id: "text", type: "text-start" },
              { delta: "回答", id: "text", type: "text-delta" },
              { id: "text", type: "text-end" },
              {
                finishReason: { raw: undefined, unified: "stop" },
                type: "finish",
                usage: {
                  inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 1200, total: 1200 },
                  outputTokens: { reasoning: 0, text: 10, total: 10 },
                },
              },
            ],
          }),
        };
      },
    }),
    settings = testSettings(),
    options = { model, sessionId: "estimate-session", settings, tools: {} };
  settings.model.maxConcurrentRequests = 1;
  const first = await streamAiModel({
    ...options,
    messages: [new HumanMessage("你好")],
  });
  expect(first.response_metadata["estimatedCacheHitRate"]).toBe(0);
  for (const mode of ["history", "recovery"] as const) {
    const stored = messageInsert(first, mode),
      messages = [
        new HumanMessage("你好"),
        decodeMessage(stored.messageJson, stored.sourceId),
        new HumanMessage("继续"),
      ],
      expected = estimateCacheHitRate(messages, toModelMessages(messages)),
      second = await streamAiModel({ ...options, messages }),
      persisted = messageInsert(second, mode),
      restored = decodeMessage(persisted.messageJson, persisted.sourceId);
    expect(expected).toBeGreaterThan(0);
    expect(modelTokenUsage(restored)).toEqual({
      cacheReadTokens: 0,
      estimatedCacheHitRate: expected,
      inputTokens: 1200,
      outputTokens: 10,
    });
  }
  expect(model.doStreamCalls).toHaveLength(3);
});
