import { expect, test } from "bun:test";
import { ToolMessage } from "@langchain/core/messages";
import { fromModelMessages } from "../../src/agent/fromAiMessages";
import { messageReasoning } from "../../src/runtime/content";
import { toModelMessages } from "../../src/agent/aiMessages";

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
    ],
    [restored] = fromModelMessages(source, "response-1");
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
  const src = "data:image/webp;base64,AAAA",
    message = new ToolMessage({
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
test.each(["responses", "messages"] as const)(
  "%s converts serialized MCP image content without rewriting the source message",
  (api) => {
    const content = JSON.stringify({
        content: [
          { text: "screenshot", type: "text" },
          { data: "AAAA", mimeType: "image/png", type: "image" },
        ],
      }),
      message = new ToolMessage({ content, name: "screenshot", tool_call_id: "image-call" });
    expect(toModelMessages([message], api)).toMatchObject([
      {
        content: [
          {
            output: {
              type: "content",
              value: [
                { text: "screenshot", type: "text" },
                {
                  data: { type: "url", url: new URL("data:image/png;base64,AAAA") },
                  mediaType: "image/png",
                  type: "file",
                },
              ],
            },
          },
        ],
      },
    ]);
    expect(message.content).toBe(content);
  },
);
