import {
  appendTranscriptEvents,
  emptyTranscriptData,
  reconcileTranscript,
} from "../../../src/app/frontend/services/transcript/cache";
import { expect, test } from "bun:test";
import type { DisplayEvent } from "../../../src/app/timeline";
import type { FileLinkUnit } from "../../../src/fileLinks/types";

test.each(
  [
    [1, 2, 3],
    [1, 3, 2],
    [2, 1, 3],
    [2, 3, 1],
    [3, 1, 2],
    [3, 2, 1],
  ].map((order) => [order]),
)("orders and deduplicates batch %j without mutating its input", (order) => {
  const input = [...order, ...order].map((id) => textEvent(id, id.toString())),
    before = structuredClone(input),
    current = runningTranscript(),
    result = appendTranscriptEvents(current, input);
  expect(result.events.map(({ id }) => id)).toEqual([1, 2, 3]);
  expect(result.view.at(-1)?.content).toBe("123");
  expect(result.eventCursor).toBe(3);
  expect(input).toEqual(before);
  expect(current.events).toEqual([]);
});
test("the last duplicate wins inside a batch and stale snapshots stay rejected", () => {
  const result = appendTranscriptEvents(runningTranscript(), [
    textEvent(2, "discarded"),
    textEvent(1, "A"),
    textEvent(2, "B"),
  ]);
  expect(result.view.at(-1)?.content).toBe("AB");
  const current = reconcileTranscript({ ...result, transcriptRevision: 5 });
  expect(reconcileTranscript({ ...result, transcriptRevision: 4 }, current)).toBe(current);
});
test("file-link replacement retains first-key order and handles multiple surfaces", () => {
  const original = link("owner", 0, "first"),
    distinct = { ...link("owner", 0, "other"), surface: "reasoning" as const },
    replacement = link("owner", 0, "updated"),
    current = reconcileTranscript({
      ...emptyTranscriptData(),
      fileLinks: [original, distinct],
    }),
    event = { ...textEvent(1, "text"), fileLinks: [replacement] },
    result = appendTranscriptEvents(current, [event]);
  expect(result.fileLinks).toEqual([replacement, distinct]);
  expect(current.fileLinks).toEqual([original, distinct]);
  expect(appendTranscriptEvents(result, [])).toBe(result);
});
function textEvent(id: number, value: string): DisplayEvent {
  return {
    id,
    kind: "assistant_text_delta",
    messageId: "message",
    partId: "text",
    queueId: 1,
    value,
  };
}
function runningTranscript() {
  return {
    ...emptyTranscriptData(),
    queue: [
      {
        content: "question",
        error: null,
        id: 1,
        status: "running" as const,
        userMessageId: 1,
      },
    ],
  };
}
function link(ownerId: string, unitIndex: number, path: string): FileLinkUnit {
  return {
    end: 4,
    matches: [{ kind: "file", path, position: { end: 4, start: 0 } }],
    ownerId,
    start: 0,
    surface: "content",
    unitIndex,
  };
}
