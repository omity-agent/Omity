import { expect, test } from "bun:test";
import { HumanMessage } from "@langchain/core/messages";
import { createOpenAI } from "@ai-sdk/openai";
import { streamAiModel } from "../../src/agent/aiAgent";
import { testSettings } from "../support/settings";

test("Responses API sends developer instructions in the top-level field", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const captureFetch = Object.assign(
    async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      if (typeof init?.body !== "string") {
        throw new Error("Responses API 请求体必须是 JSON 字符串");
      }
      const parsed: unknown = JSON.parse(init.body);
      if (!isRecord(parsed)) {
        throw new Error("Responses API 请求体必须是 JSON 对象");
      }
      requestBody = parsed;
      return Response.json(
        { error: { message: "request captured", type: "invalid_request_error" } },
        { status: 400 },
      );
    },
    { preconnect: fetch.preconnect },
  );
  const model = createOpenAI({
    apiKey: "test",
    fetch: captureFetch,
  }).responses("gpt-5");
  const settings = testSettings();
  settings.agent.systemPrompt = "developer instructions";
  settings.model = {
    adapter: "responses",
    apiKeyEnv: "TEST_KEY",
    baseURL: null,
    model: "gpt-5",
    retryDelayMs: 1000,
    temperature: 0,
    timeoutMs: 1000,
  };

  let rejection: unknown;
  try {
    await streamAiModel({
      messages: [new HumanMessage("hello")],
      model,
      sessionId: "test-session",
      settings,
      tools: {},
    });
  } catch (error) {
    rejection = error;
  }

  expect(rejection).toMatchObject({ message: "request captured" });
  expect(requestBody).toMatchObject({
    input: [
      {
        content: [{ text: "hello", type: "input_text" }],
        role: "user",
      },
    ],
    instructions: "developer instructions",
    model: "gpt-5",
    stream: true,
  });
  const input = requestBody?.["input"];
  expect(Array.isArray(input)).toBe(true);
  expect(
    Array.isArray(input) &&
      input.some(
        (item) => isRecord(item) && (item["role"] === "developer" || item["role"] === "system"),
      ),
  ).toBe(false);
});
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
