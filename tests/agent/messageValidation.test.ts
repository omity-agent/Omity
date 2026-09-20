import { expect, test } from "bun:test";
import { AIMessage } from "@langchain/core/messages";
import type { ModelMessage } from "ai";
import { decodeMessage } from "../../src/infrastructure/database/records/messages/hydration";
import { encodeMessage } from "../../src/infrastructure/database/records/messages/payload";
import { fromModelMessages } from "../../src/agent/fromAiMessages";
import { required } from "../support/database";
import { toModelMessages } from "../../src/agent/aiMessages";

type HostedOutput = Extract<
  Exclude<Extract<ModelMessage, { role: "assistant" }>["content"], string>[number],
  { type: "tool-result" }
>["output"];
const hostedOutputs: HostedOutput[] = [
  { reason: "denied", type: "execution-denied" },
  {
    type: "content",
    value: [
      {
        providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
        text: "hosted result",
        type: "text",
      },
    ],
  },
];
test.each(hostedOutputs)("SDK-supported hosted output survives persistence: %j", (output) => {
  const source: ModelMessage[] = [
      {
        content: [
          {
            input: { query: "search" },
            providerExecuted: true,
            toolCallId: "hosted-call",
            toolName: "search",
            type: "tool-call",
          },
          { output, toolCallId: "hosted-call", toolName: "search", type: "tool-result" },
        ],
        role: "assistant",
      },
    ],
    message = required(fromModelMessages(source, "hosted-response")[0]),
    restored = decodeMessage(JSON.stringify(encodeMessage(message, "history")));
  expect(toModelMessages([restored])).toEqual(source);
});
test.each([
  [{ text: 42, type: "text" }],
  [{ providerOptions: { openai: "invalid" }, text: "reasoning", type: "reasoning" }],
  [{ input: {}, toolCallId: "local", toolName: "search", type: "tool-call" }],
  [
    {
      input: undefined,
      providerExecuted: true,
      toolCallId: "hosted",
      toolName: "search",
      type: "tool-call",
    },
  ],
  [
    {
      output: { type: "content", value: [{ text: 42, type: "text" }] },
      toolCallId: "hosted",
      toolName: "search",
      type: "tool-result",
    },
  ],
  [{ data: { data: "AAAA", type: "data" }, mediaType: "image/png", type: "file" }],
])("rejects malformed or misplaced stored assistant content: %j", (...content) => {
  const message = new AIMessage({ additional_kwargs: { aiSdkContent: content }, content: "" });
  expect(() => toModelMessages([message])).toThrow("会话保存的 AI SDK 内容格式无效");
});
