import {
  type TranscriptSnapshot,
  appendTranscriptEvents,
  emptyTranscriptData,
  reconcileTranscript,
} from "../../../src/app/frontend/services/transcript/cache";
import { expect, test } from "bun:test";
import type { DisplayEvent } from "../../../src/app/timeline";

test("replays deltas that arrive after an older snapshot", () => {
  const current = appendTranscriptEvents(emptyTranscriptData(), [textEvent(2, "B")]),
    data = reconcileTranscript(snapshot(1, [textEvent(1, "A")]), current);
  expect(data.eventCursor).toBe(2);
  expect(data.events.map(({ id }) => id)).toEqual([1, 2]);
  expect(data.view.at(-1)?.content).toBe("AB");
});
test("deduplicates event ids without collapsing repeated text", () => {
  const data = appendTranscriptEvents(emptyTranscriptData(), [
    textEvent(1, "A"),
    textEvent(1, "A"),
    textEvent(2, "A"),
  ]);
  expect(data.events.map(({ id }) => id)).toEqual([1, 2]);
});
test("accepts a lower event id that arrives after a higher id beyond the snapshot cursor", () => {
  const initial = reconcileTranscript(snapshot(0, [])),
    high = appendTranscriptEvents(initial, [textEvent(3, "C")]),
    complete = appendTranscriptEvents(high, [textEvent(1, "A"), textEvent(2, "B")]);
  expect(complete.events.map(({ id }) => id)).toEqual([1, 2, 3]);
  expect(complete.view.at(-1)?.content).toBe("ABC");
});
test("completed snapshots replace cleared stream events", () => {
  const streaming = reconcileTranscript(snapshot(2, [textEvent(1, "A"), textEvent(2, "B")])),
    completed: TranscriptSnapshot = {
      ...snapshot(2, []),
      messages: [
        {
          content: "AB",
          createdAt: 1,
          id: 10,
          images: [],
          queueId: 1,
          reasoning: "",
          role: "assistant",
          sourceId: "assistant-10",
          toolCalls: [],
        },
      ],
      queue: [],
    },
    data = reconcileTranscript(completed, streaming);
  expect(data.events).toEqual([]);
  expect(data.view).toHaveLength(1);
  expect(data.view[0]?.content).toBe("AB");
});
test("a lower revision cannot replace tool output at the same event cursor", () => {
  const call = toolCallEvent(1),
    completed = reconcileTranscript({
      ...snapshot(3, [call, startedEvent(2), finishedEvent(3)], 4),
      messages: [toolOutput()],
    }),
    stale = reconcileTranscript(snapshot(3, [call, startedEvent(2)], 3), completed);
  expect(stale).toBe(completed);
  const tool = stale.view.flatMap((message) => message.parts).find((part) => part.type === "tool");
  expect(tool?.type === "tool" ? tool.phase : undefined).toBe("completed");
  expect(tool?.type === "tool" ? tool.output?.content : undefined).toBe("done");
});
test("a completion event carries the output and settles the tool immediately", () => {
  const data = reconcileTranscript(
      snapshot(3, [toolCallEvent(1), startedEvent(2), finishedEvent(3)]),
    ),
    tool = data.view.flatMap((message) => message.parts).find((part) => part.type === "tool");
  expect(tool?.type === "tool" ? tool.phase : undefined).toBe("completed");
  expect(tool?.type === "tool" ? tool.output?.content : undefined).toBe("done");
});
test("serialized tool completions settle only the completed call", () => {
  const current = reconcileTranscript(
      snapshot(3, [
        toolCallEvent(1, "call-1", "tool-0", 0, "first"),
        toolCallEvent(2, "call-2", "tool-1", 1, "second"),
        startedEvent(3, "call-1", "tool-0"),
      ]),
    ),
    next = appendTranscriptEvents(current, [
      finishedEvent(4, "call-1", "tool-0", "first done"),
      startedEvent(5, "call-2", "tool-1"),
    ]),
    tools = next.view.flatMap((message) =>
      message.parts.flatMap((part) => (part.type === "tool" ? [part] : [])),
    );
  expect(tools.map((tool) => [tool.call.id, tool.phase])).toEqual([
    ["call-1", "completed"],
    ["call-2", "running"],
  ]);
});
function snapshot(
  eventCursor: number,
  events: DisplayEvent[],
  transcriptRevision = eventCursor,
): TranscriptSnapshot {
  return {
    control: "running",
    eventCursor,
    events,
    fileLinks: [],
    messages: [],
    queue: [
      {
        content: "question",
        error: null,
        id: 1,
        status: "running",
        userMessageId: 1,
      },
    ],
    transcriptRevision,
  };
}
function toolOutput() {
  return {
    content: "done",
    createdAt: 1,
    id: 10,
    images: [],
    queueId: 1,
    reasoning: "",
    role: "tool" as const,
    sourceId: "tool-1",
    toolCallId: "call-1",
    toolCalls: [],
  };
}
function textEvent(id: number, text: string): DisplayEvent {
  return {
    id,
    kind: "assistant_text_delta",
    messageId: "message-1",
    partId: "text-1",
    queueId: 1,
    value: text,
  };
}
function toolCallEvent(
  id: number,
  callId = "call-1",
  partId = "tool-0",
  index = 0,
  name = "shell",
): DisplayEvent {
  return {
    id,
    kind: "tool_call_delta",
    messageId: "message-1",
    partId,
    queueId: 1,
    value: {
      idDelta: callId,
      index,
      nameDelta: name,
    },
  };
}
function startedEvent(id: number, callId = "call-1", partId = "tool-0"): DisplayEvent {
  return {
    id,
    kind: "tool_started",
    messageId: "message-1",
    partId,
    queueId: 1,
    value: callId,
  };
}
function finishedEvent(
  id: number,
  callId = "call-1",
  partId = "tool-0",
  content = "done",
): DisplayEvent {
  return {
    id,
    kind: "tool_finished",
    messageId: "message-1",
    partId,
    queueId: 1,
    value: {
      callId,
      output: { content, images: [], outputTokens: 1 },
    },
  };
}
