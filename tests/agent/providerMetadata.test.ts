import { expect, test } from "bun:test";
import { fromModelMessages } from "../../src/agent/fromAiMessages";
import { toModelMessages } from "../../src/agent/aiMessages";

test("AI SDK tool item IDs are discarded when model messages are stored", () => {
  const source = [
      {
        content: [
          {
            input: "raw command",
            providerOptions: { openai: { itemId: "fc-item-1", namespace: "workspace" } },
            toolCallId: "custom-1",
            toolName: "shell",
            type: "tool-call" as const,
          },
        ],
        role: "assistant" as const,
      },
    ],
    messages = fromModelMessages(source, "response-1");
  expect(messages[0]?.additional_kwargs).toEqual({
    aiSdkContent: [],
    aiSdkToolProviderOptions: {
      "custom-1": { openai: { namespace: "workspace" } },
    },
  });
  expect(toModelMessages(messages)).toEqual([
    {
      content: [
        {
          input: "raw command",
          providerOptions: { openai: { namespace: "workspace" } },
          toolCallId: "custom-1",
          toolName: "shell",
          type: "tool-call",
        },
      ],
      role: "assistant",
    },
  ]);
});
