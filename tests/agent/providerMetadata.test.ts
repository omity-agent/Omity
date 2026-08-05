import { expect, test } from "bun:test";
import { fromModelMessages } from "../../src/agent/fromAiMessages";
import { toModelMessages } from "../../src/agent/aiMessages";

test("AI SDK custom tool provider metadata survives persistence adapters", () => {
  const source = [
    {
      content: [
        {
          input: "raw command",
          providerOptions: { openai: { itemId: "custom-item-1" } },
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
