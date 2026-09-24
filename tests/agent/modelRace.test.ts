import { expect, spyOn, test } from "bun:test";
import { APICallError } from "@ai-sdk/provider";
import { HumanMessage } from "@langchain/core/messages";
import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream } from "ai";
import { streamAiModel } from "../../src/agent/model/request";
import { testSettings } from "../support/settings";

const usage = {
  inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 1, total: 1 },
  outputTokens: { reasoning: 0, text: 2, total: 2 },
};
test("model stream remains open during idle gaps", async () => {
  const settings = testSettings();
  settings.model.raceIntervalMs = 1;
  settings.model.maxConcurrentRequests = 1;
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
    }),
    response = await streamAiModel({
      messages: [new HumanMessage("Say hello")],
      model,
      sessionId: "test-session",
      settings,
      tools: {},
    });
  expect(response.text).toBe("Hello world");
  expect(model.doStreamCalls[0]?.prompt[0]).toEqual({
    content: "test",
    role: "system",
  });
  expect(model.doStreamCalls).toHaveLength(1);
});
test("model race keeps the first request until a winner appears", async () => {
  const settings = testSettings(),
    writtenTypes: string[] = [],
    writtenText: string[] = [];
  settings.model.raceIntervalMs = 30;
  settings.model.maxConcurrentRequests = 2;
  let firstAborted = false,
    requests = 0;
  const model = new MockLanguageModelV4({
      doStream: async ({ abortSignal }) => {
        requests += 1;
        if (requests === 1) {
          if (!abortSignal) {
            throw new Error("模型请求缺少取消信号");
          }
          return {
            stream: new ReadableStream({
              start(controller) {
                controller.enqueue({
                  id: "response-1",
                  modelId: "mock",
                  timestamp: new Date(0),
                  type: "response-metadata",
                });
                controller.enqueue({ id: "text-1", type: "text-start" });
                abortSignal.addEventListener(
                  "abort",
                  () => {
                    firstAborted = true;
                    controller.error(abortSignal.reason);
                  },
                  { once: true },
                );
              },
            }),
          };
        }
        expect(firstAborted).toBe(false);
        return {
          stream: simulateReadableStream({
            chunks: [
              {
                id: "response-2",
                modelId: "mock",
                timestamp: new Date(0),
                type: "response-metadata",
              },
              { id: "text-2", type: "text-start" },
              { delta: "winner", id: "text-2", type: "text-delta" },
              { id: "text-2", type: "text-end" },
              { finishReason: { raw: undefined, unified: "stop" }, type: "finish", usage },
            ],
          }),
        };
      },
    }),
    response = await streamAiModel({
      messages: [new HumanMessage("Say hello")],
      model,
      sessionId: "test-session",
      settings,
      tools: {},
      write: ({ part }) => {
        writtenTypes.push(part.type);
        if (part.type === "text-delta") {
          writtenText.push(part.text);
        }
      },
    });
  expect(response.text).toBe("winner");
  expect(model.doStreamCalls).toHaveLength(2);
  expect(firstAborted).toBe(true);
  expect(writtenTypes.filter((type) => type === "start")).toHaveLength(1);
  expect(writtenText).toEqual(["winner"]);
});
test("model race does not exceed its concurrent request limit", async () => {
  const settings = testSettings(),
    controller = new AbortController();
  settings.model.raceIntervalMs = 1;
  settings.model.maxConcurrentRequests = 2;
  let requests = 0;
  const model = new MockLanguageModelV4({
    doStream: async ({ abortSignal }) => ({
      stream: new ReadableStream({
        start(streamController) {
          requests += 1;
          streamController.enqueue({
            id: `response-${requests}`,
            modelId: "mock",
            timestamp: new Date(0),
            type: "response-metadata",
          });
          streamController.enqueue({
            id: `text-${requests}`,
            type: "text-start",
          });
          abortSignal?.addEventListener("abort", () => streamController.error(abortSignal.reason), {
            once: true,
          });
        },
      }),
    }),
  });
  const promise = streamAiModel({
    messages: [new HumanMessage("Say hello")],
    model,
    sessionId: "test-session",
    settings,
    signal: controller.signal,
    tools: {},
  });
  const abortTimer = setTimeout(() => controller.abort(), 20);
  await promise.catch(() => undefined);
  clearTimeout(abortTimer);
  expect(requests).toBe(2);
});
test("model stream errors are propagated without terminal output", async () => {
  const log = spyOn(console, "error").mockReturnValue(undefined),
    providerError = new APICallError({
      data: {
        error: {
          code: "server_error",
          message: "Our servers are currently overloaded. Please try again later.",
          type: "service_unavailable_error",
        },
      },
      message: "Our servers are currently overloaded. Please try again later.",
      requestBodyValues: {},
      statusCode: 503,
      url: "https://provider.example.test/v1/responses",
    }),
    model = new MockLanguageModelV4({
      doStream: {
        stream: simulateReadableStream({
          chunks: [{ error: providerError, type: "error" }],
        }),
      },
    });
  try {
    let rejection: unknown;
    try {
      await streamAiModel({
        messages: [new HumanMessage("Say hello")],
        model,
        sessionId: "test-session",
        settings: testSettings(),
        tools: {},
      });
    } catch (error) {
      rejection = error;
    }
    expect(rejection).toMatchObject({ message: providerError.message });
    expect(log).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
  }
});
