import {
  appendTranscriptEvents,
  emptyTranscriptData,
} from "../../../src/app/frontend/services/transcript/cache";
import { expect, test } from "bun:test";
import type { DisplayEvent } from "../../../src/app/timeline";
import { transcriptResponseSchema } from "../../../src/app/timeline/contracts/records";

test("large event bursts advance the cursor without spreading function arguments", () => {
  const events = Array.from({ length: 150_000 }, (_, index): DisplayEvent => ({
      id: index + 1,
      kind: "assistant_text_delta",
      messageId: "message",
      partId: "text",
      queueId: 1,
      value: "",
    })),
    current = emptyTranscriptData(),
    result = appendTranscriptEvents(current, events);
  expect(result.eventCursor).toBe(events.length);
  expect(result.events).toHaveLength(events.length);
  expect(current.events).toEqual([]);
  expect(appendTranscriptEvents(result, [])).toBe(result);
  expect(appendTranscriptEvents(result, events)).toBe(result);
});
test("shared transcript contracts retain nested response validation", () => {
  const snapshot = {
    ...emptyTranscriptData(),
    events: [
      {
        id: 1,
        kind: "tool_finished" as const,
        messageId: "message",
        partId: "tool",
        queueId: 1,
        value: { callId: "call", output: { content: "done", images: [], outputTokens: 0 } },
      },
    ],
  };
  expect(transcriptResponseSchema.parse(snapshot).events).toEqual(snapshot.events);
  expect(
    transcriptResponseSchema.safeParse({
      ...snapshot,
      events: [{ ...snapshot.events[0], value: { callId: "call", output: { images: [] } } }],
    }).success,
  ).toBe(false);
  expect(transcriptResponseSchema.safeParse({ ...snapshot, eventCursor: -1 }).success).toBe(false);
});
