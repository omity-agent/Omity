import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { expect, test } from "bun:test";
import { decodeMessage } from "../../src/infrastructure/database/records/messages/hydration";
import { messageInsert } from "../../src/infrastructure/database/records/messages/serialization";
import { structuredOutputArtifact } from "../../src/infrastructure/mcp/tools/structured";

test.each([
  { content: null, type: "human" },
  { content: [null], type: "human" },
  { content: [{ type: 1 }], type: "human" },
  { content: "", type: "unknown" },
  { content: "", toolCalls: [{ args: {}, name: "tool", type: "invalid" }], type: "ai" },
  { content: "", toolCalls: [{ args: "bad", name: "tool", type: "tool_call" }], type: "ai" },
  { content: "", reasoning: [], type: "ai" },
  { content: "", type: "ai", usage: { cacheRead: 0, input: -1, output: 1 } },
  { content: "", type: "ai", usage: { cacheRead: 0, input: "1", output: 1 } },
  { content: "", type: "ai", usage: { cacheRead: 0, input: Number.MAX_SAFE_INTEGER, output: 1 } },
  { content: "", status: "success", toolCallId: 42, type: "tool" },
  { content: "", largeOutputTokens: -1, status: "success", toolCallId: "tool", type: "tool" },
  { content: "", custom: "true", status: "success", toolCallId: "tool", type: "tool" },
  { content: "", status: "unknown", toolCallId: "tool", type: "tool" },
  { builtInTool: "unknown", content: "", status: "success", toolCallId: "tool", type: "tool" },
  { content: "", extra: true, type: "human" },
])("rejects corrupt stored messages instead of dropping fields: %j", (value) => {
  expect(() => decodeMessage(JSON.stringify(value))).toThrow();
});
test.each(["history", "recovery"] as const)(
  "round-trips tool execution status and stable built-in identity in %s messages",
  (mode) => {
    for (const status of ["success", "error"] as const) {
      const message = new ToolMessage({
          content: "result",
          id: "result",
          metadata: { builtInTool: "update_title" },
          name: "renamed_heading",
          status,
          tool_call_id: "call",
        }),
        inserted = messageInsert(message, mode),
        restored = decodeMessage(inserted.messageJson, inserted.sourceId);
      expect(restored).toMatchObject({
        metadata: message.metadata,
        name: message.name,
        status,
        tool_call_id: "call",
      });
    }
  },
);
test("round-trips replay content, provider fields, usage and custom tool calls", () => {
  const message = new AIMessage({
    additional_kwargs: {
      aiSdkContent: [
        { providerOptions: { openai: { itemId: "item" } }, text: "text", type: "text" },
      ],
      reasoning: { encrypted_content: "encrypted", type: "reasoning" },
    },
    content: [{ providerField: "retained", text: "text", type: "text" }],
    id: "assistant",
    tool_calls: [{ args: { input: "free-form" }, id: "call", name: "tool", type: "tool_call" }],
    usage_metadata: {
      input_token_details: { cache_read: 2 },
      input_tokens: 5,
      output_tokens: 3,
      total_tokens: 8,
    },
  });
  Reflect.set(message.tool_calls![0]!, "isCustomTool", true);
  const inserted = messageInsert(message),
    restored = decodeMessage(inserted.messageJson, inserted.sourceId);
  expect(restored).toBeInstanceOf(AIMessage);
  if (!AIMessage.isInstance(restored)) {
    throw new Error("expected assistant message");
  }
  expect(restored.content).toEqual(message.content);
  expect(restored.additional_kwargs).toEqual(message.additional_kwargs);
  expect(restored.tool_calls).toEqual(message.tool_calls);
  expect(restored.usage_metadata).toEqual(message.usage_metadata);
});
test("round-trips tool recovery artifacts and human messages", () => {
  const messages = [
    new HumanMessage({ content: "question", id: "user" }),
    new ToolMessage({
      artifact: structuredOutputArtifact({ result: [1, 2] }),
      content: [{ text: "result", type: "text" }],
      id: "result",
      metadata: { customTool: true, largeOutput: { tokens: 12 } },
      name: "tool",
      tool_call_id: "call",
    }),
  ];
  for (const message of messages) {
    const inserted = messageInsert(message, "recovery"),
      restored = decodeMessage(inserted.messageJson, inserted.sourceId);
    expect(restored.content).toEqual(message.content);
    expect(restored.id).toBe(message.id);
    if (ToolMessage.isInstance(message) && ToolMessage.isInstance(restored)) {
      expect(restored.artifact).toEqual(message.artifact);
      expect(restored.metadata).toEqual(message.metadata);
      expect(restored.tool_call_id).toBe(message.tool_call_id);
    }
  }
});
