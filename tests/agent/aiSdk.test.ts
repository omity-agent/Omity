import { ToolLoopAgent, dynamicTool, simulateReadableStream } from "ai";
import { expect, test } from "bun:test";
import { MockLanguageModelV4 } from "ai/test";
import { ToolMessage } from "@langchain/core/messages";
import { fromModelMessages } from "../../src/agent/fromAiMessages";
import { messageReasoning } from "../../src/runtime/content";
import { toModelMessages } from "../../src/agent/aiMessages";
import { z } from "zod";

const usage = {
  inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 1, total: 1 },
  outputTokens: { reasoning: 0, text: 1, total: 1 },
};
test("ToolLoopAgent streams model text with the AI SDK protocol", async () => {
  const agent = new ToolLoopAgent({
    model: new MockLanguageModelV4({
      doStream: {
        stream: simulateReadableStream({
          chunks: [
            {
              id: "response-1",
              modelId: "mock",
              timestamp: new Date(0),
              type: "response-metadata",
            },
            { id: "text-1", type: "text-start" },
            { delta: "Hello", id: "text-1", type: "text-delta" },
            { id: "text-1", type: "text-end" },
            { finishReason: { raw: undefined, unified: "stop" }, type: "finish", usage },
          ],
        }),
      },
    }),
  });
  const result = await agent.stream({ prompt: "Say hello" });
  const parts = [];
  for await (const part of result.stream) {
    parts.push(part);
  }
  expect(parts.find((part) => part.type === "text-delta")).toMatchObject({ text: "Hello" });
  expect(await result.text).toBe("Hello");
});
test("ToolLoopAgent executes tools and feeds their result to the next step", async () => {
  const calls: string[] = [];
  const completedSteps: string[][] = [];
  const model = new MockLanguageModelV4({
    doStream: [
      {
        stream: simulateReadableStream({
          chunks: [
            {
              input: '{"value":"first"}',
              toolCallId: "call-1",
              toolName: "echo",
              type: "tool-call",
            },
            { finishReason: { raw: undefined, unified: "tool-calls" }, type: "finish", usage },
          ],
        }),
      },
      {
        stream: simulateReadableStream({
          chunks: [
            { id: "text-2", type: "text-start" },
            { delta: "done", id: "text-2", type: "text-delta" },
            { id: "text-2", type: "text-end" },
            { finishReason: { raw: undefined, unified: "stop" }, type: "finish", usage },
          ],
        }),
      },
    ],
  });
  const agent = new ToolLoopAgent({
    model,
    tools: {
      echo: dynamicTool({
        execute: (input) => {
          if (!isEchoInput(input)) {
            throw new Error("echo input invalid");
          }
          calls.push(input.value);
          return "echoed";
        },
        inputSchema: z.object({ value: z.string() }),
      }),
    },
  });
  const result = await agent.stream({
    onStepEnd: ({ response }) => {
      completedSteps.push(response.messages.map(({ role }) => role));
    },
    prompt: "run echo",
  });
  await result.consumeStream();
  expect(calls).toEqual(["first"]);
  expect(await result.text).toBe("done");
  expect(model.doStreamCalls).toHaveLength(2);
  expect(completedSteps).toEqual([["assistant", "tool"], ["assistant"]]);
});
function isEchoInput(value: unknown): value is { value: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "value" in value &&
    typeof value.value === "string"
  );
}
test("AI SDK reasoning provider metadata survives persistence adapters", () => {
  const source = [
    {
      content: [
        {
          providerOptions: {
            openai: { itemId: "reasoning-1", reasoningEncryptedContent: "encrypted" },
          },
          text: "summary",
          type: "reasoning" as const,
        },
        { text: "answer", type: "text" as const },
      ],
      role: "assistant" as const,
    },
  ];
  const [restored] = fromModelMessages(source, "response-1");
  expect(restored?.content).toBe("answer");
  expect(restored ? messageReasoning(restored) : "").toBe("summary");
  expect(restored ? toModelMessages([restored]) : []).toEqual(source);
});
test("AI SDK custom tool string input survives persistence adapters", () => {
  const source = [
    {
      content: [
        {
          input: "raw command",
          toolCallId: "custom-1",
          toolName: "shell",
          type: "tool-call" as const,
        },
      ],
      role: "assistant" as const,
    },
  ];
  expect(toModelMessages(fromModelMessages(source, "response-1"))).toEqual(source);
});
test("AI SDK receives provider-native tool images for Responses API", () => {
  const src = "data:image/webp;base64,AAAA";
  const message = new ToolMessage({
    content: [
      { text: "result", type: "text" },
      { image_url: { url: src }, type: "image_url" },
    ],
    name: "screenshot",
    tool_call_id: "call-1",
  });
  expect(toModelMessages([message], "responses")).toEqual([
    {
      content: [
        {
          output: {
            type: "content",
            value: [
              { text: "result", type: "text" },
              {
                data: { type: "url", url: new URL(src) },
                mediaType: "image/webp",
                type: "file",
              },
            ],
          },
          toolCallId: "call-1",
          toolName: "screenshot",
          type: "tool-result",
        },
      ],
      role: "tool",
    },
  ]);
});
test("AI SDK sends a text notice when Completions cannot consume tool images", () => {
  const message = new ToolMessage({
    content: [
      { text: "result", type: "text" },
      { data: "AAAA", mimeType: "image/png", type: "image" },
    ],
    name: "screenshot",
    tool_call_id: "call-1",
  });
  expect(toModelMessages([message], "completions")).toMatchObject([
    {
      content: [
        {
          output: {
            type: "text",
            value: "result\n\n工具返回了 1 张图片，但 Completions API 不支持工具返回图片给模型。",
          },
        },
      ],
    },
  ]);
});
