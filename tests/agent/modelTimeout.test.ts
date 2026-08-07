import { expect, test } from "bun:test";
import { HumanMessage } from "@langchain/core/messages";
import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream } from "ai";
import { streamAiModel } from "../../src/agent/aiAgent";
import { testSettings } from "../support/settings";

const usage = {
  inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 1, total: 1 },
  outputTokens: { reasoning: 0, text: 2, total: 2 },
};
test("model timeout resets after each stream update", async () => {
  const settings = testSettings();
  settings.model.timeoutMs = 100;
  const model = new MockLanguageModelV4({
    doStream: {
      stream: simulateReadableStream({
        chunkDelayInMs: 30,
        chunks: [
          {
            id: "response-1",
            modelId: "mock",
            timestamp: new Date(0),
            type: "response-metadata",
          },
          { id: "text-1", type: "text-start" },
          { delta: "Hello ", id: "text-1", type: "text-delta" },
          { delta: "world", id: "text-1", type: "text-delta" },
          { id: "text-1", type: "text-end" },
          { finishReason: { raw: undefined, unified: "stop" }, type: "finish", usage },
        ],
      }),
    },
  });
  const response = await streamAiModel({
    messages: [new HumanMessage("Say hello")],
    model,
    sessionId: "test-session",
    settings,
    tools: {},
  });
  expect(response.text).toBe("Hello world");
});
