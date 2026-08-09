import {
  type DisplayEvent,
  type DisplayMessage,
  type DisplayQueue,
  buildTimeline,
  canCancelToolCall,
} from "../../../src/app/timeline";
import { expect, test } from "bun:test";

test("paused final tool call replaces its stream and remains cancellable before starting", () => {
  const messages: DisplayMessage[] = [
    {
      content: "",
      createdAt: 1,
      id: 1,
      images: [],
      queueId: null,
      reasoning: "",
      role: "assistant",
      sourceId: "message-1",
      toolCalls: [
        {
          id: "call-1",
          index: 0,
          input: {},
          inputTokens: 1,
          name: "terminal_new_tab",
        },
      ],
    },
  ];
  const queue: DisplayQueue[] = [{ content: "run", error: null, id: 1, status: "paused" }];
  const events: DisplayEvent[] = [
    {
      id: 1,
      kind: "tool_call_delta",
      messageId: "message-1",
      partId: "tool-0",
      queueId: 1,
      value: { idDelta: "call-1", index: 0, nameDelta: "terminal_new_tab" },
    },
  ];
  const view = buildTimeline(messages, queue, events);
  expect(view).toHaveLength(1);
  expect(toolCalls(view[0])).toHaveLength(1);
  const phase = toolParts(view[0])[0]?.phase;
  expect(phase).toBe("pending");
  expect(phase && canCancelToolCall(phase)).toBe(true);
});
test("streaming tool call is grouped with previous assistant message", () => {
  const messages: DisplayMessage[] = [
    {
      content: "",
      createdAt: 1,
      id: 1,
      images: [],
      queueId: null,
      reasoning: "",
      role: "assistant",
      sourceId: "message-1",
      toolCalls: [
        {
          id: "call-1",
          index: 0,
          input: {},
          inputTokens: 1,
          name: "terminal_new_tab",
        },
      ],
    },
  ];
  const queue: DisplayQueue[] = [{ content: "run", error: null, id: 1, status: "running" }];
  const events: DisplayEvent[] = [
    {
      id: 1,
      kind: "tool_call_delta",
      messageId: "message-2",
      partId: "tool-1",
      queueId: 1,
      value: { idDelta: "call-2", index: 1, nameDelta: "terminal_send_command" },
    },
  ];
  const view = buildTimeline(messages, queue, events);
  expect(view).toHaveLength(1);
  expect(toolCalls(view[0]).map((call) => call.id)).toEqual(["call-1", "call-2"]);
});
test("tool output retains images", () => {
  const image = {
    mimeType: "image/png",
    src: "data:image/png;base64,iVBORw0KGgo=",
  };
  const messages: DisplayMessage[] = [
    {
      content: "",
      createdAt: 1,
      id: 1,
      images: [],
      queueId: null,
      reasoning: "",
      role: "assistant",
      toolCalls: [{ id: "call-1", index: 0, input: {}, inputTokens: 1, name: "capture" }],
    },
    {
      content: "",
      createdAt: 2,
      id: 2,
      images: [image],
      queueId: null,
      reasoning: "",
      role: "tool",
      toolCallId: "call-1",
      toolCalls: [],
    },
  ];
  const view = buildTimeline(messages, [], []);
  const output = view[0]?.parts.find((part) => part.type === "tool")?.output;
  expect(output?.images).toEqual([image]);
});
test("started tool call exposes an empty output state", () => {
  const messages: DisplayMessage[] = [
    {
      content: "",
      createdAt: 1,
      id: 1,
      images: [],
      queueId: null,
      reasoning: "",
      role: "assistant",
      toolCalls: [{ id: "call-1", index: 0, input: {}, inputTokens: 1, name: "capture" }],
    },
  ];
  const events: DisplayEvent[] = [
    {
      id: 1,
      kind: "tool_started",
      messageId: "message-1",
      partId: "tool-0",
      queueId: 1,
      value: "call-1",
    },
  ];
  const part = buildTimeline(messages, [], events)[0]?.parts.find((item) => item.type === "tool");
  expect(part?.type === "tool" ? part.phase : undefined).toBe("running");
  expect(part?.output).toBeUndefined();
});
test("pending tool calls remain cancellable at a pause boundary", () => {
  expect(canCancelToolCall("pending")).toBe(true);
  expect(canCancelToolCall("running")).toBe(true);
  expect(canCancelToolCall("streaming")).toBe(false);
  expect(canCancelToolCall("completed")).toBe(false);
});
test("grouped assistant messages retain the latest token usage", () => {
  const usage = {
    cacheReadTokens: 900,
    inputTokens: 1200,
    outputTokens: 300,
  };
  const messages: DisplayMessage[] = [
    assistant(1, {
      cacheReadTokens: 400,
      inputTokens: 800,
      outputTokens: 200,
    }),
    assistant(2, usage),
  ];
  const view = buildTimeline(messages, [], []);
  expect(view).toHaveLength(1);
  expect(view[0]?.usage).toEqual(usage);
});
function assistant(id: number, usage: NonNullable<DisplayMessage["usage"]>): DisplayMessage {
  return {
    content: `回答 ${id.toString()}`,
    createdAt: id,
    id,
    images: [],
    queueId: null,
    reasoning: "",
    role: "assistant",
    toolCalls: [],
    usage,
  };
}
function toolCalls(message: ReturnType<typeof buildTimeline>[number] | undefined) {
  return message?.parts.flatMap((part) => (part.type === "tool" ? [part.call] : [])) ?? [];
}
function toolParts(message: ReturnType<typeof buildTimeline>[number] | undefined) {
  return message?.parts.filter((part) => part.type === "tool") ?? [];
}
