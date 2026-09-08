import { expect, test } from "bun:test";
import {
  messageSpans,
  visibleCopies,
} from "../../../src/app/frontend/components/Transcript/actions/messageSpans";
import type { TimelineMessage } from "../../../src/app/timeline";
import { segmentTranscript } from "../../../src/app/frontend/components/Transcript/segments";

function message(key: string, count: number): TimelineMessage {
  return {
    content: `complete ${key}`,
    createdAt: 0,
    id: 1,
    key,
    parts: Array.from({ length: count }, () => ({ content: "part", type: "content" })),
    role: "assistant",
  };
}
test("copy action follows the full message when its first part is unmounted", () => {
  const original = message("long", 100),
    segments = segmentTranscript([original]),
    spans = messageSpans(segments),
    copies = visibleCopies({ first: 75, last: 76 }, spans);
  expect(copies).toHaveLength(1);
  expect(copies[0]).toEqual({ first: 0, last: 99, message: original });
  expect(copies[0]?.message.content).toBe("complete long");
});
test("overlapping messages keep separate action boundaries", () => {
  const segments = segmentTranscript([message("first", 5), message("second", 5)]),
    copies = visibleCopies({ first: 4, last: 5 }, messageSpans(segments));
  expect(copies.map(({ first, last }) => [first, last])).toEqual([
    [0, 4],
    [5, 9],
  ]);
});
test("copy action is removed once no segment of its message is visible", () => {
  const segments = segmentTranscript([message("first", 5), message("second", 5)]),
    copies = visibleCopies({ first: 7, last: 7 }, messageSpans(segments));
  expect(copies.map(({ message: original }) => original.key)).toEqual(["second"]);
});
test("user messages keep their existing in-bubble actions without a duplicate overlay", () => {
  const user = { ...message("user", 1), role: "user" as const },
    segments = segmentTranscript([user]);
  expect(visibleCopies({ first: 0, last: 0 }, messageSpans(segments))).toEqual([]);
});
