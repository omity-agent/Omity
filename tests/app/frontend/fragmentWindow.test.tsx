import type { TimelineMessage, TimelinePart } from "../../../src/app/timeline";
import { expect, test } from "bun:test";
import { Body } from "../../../src/app/frontend/components/Transcript/Body";
import { renderToStaticMarkup } from "react-dom/server";
import { segmentTranscript } from "../../../src/app/frontend/components/Transcript/segments";

const ignoreToolCancellation = () => Promise.resolve();

function assistant(parts: TimelinePart[]): TimelineMessage {
  return { content: "answer", createdAt: 0, id: 1, key: "assistant-1", parts, role: "assistant" };
}
function content(index: number): TimelinePart {
  return { content: `fragment_${index.toString()}_end`, type: "content" };
}
test("a dense assistant bubble is windowed at part granularity", () => {
  const message = assistant(Array.from({ length: 162 }, (_, index) => content(index))),
    segments = segmentTranscript([message]);
  expect(segments).toHaveLength(162);
  expect(segments[0]?.partIndex).toBe(0);
  expect(segments[161]?.partIndex).toBe(161);
  expect(segments[161]?.message).toBe(message);
});
test("user messages remain a single scrollable bubble", () => {
  const message: TimelineMessage = {
      ...assistant([content(0), content(1)]),
      role: "user",
    },
    segments = segmentTranscript([message]);
  expect(segments).toEqual([{ key: message.key, message }]);
});
test("appending parts preserves the identities of existing virtual rows", () => {
  const message = assistant([content(0), content(1)]),
    before = segmentTranscript([message]),
    after = segmentTranscript([{ ...message, parts: [...message.parts, content(2)] }]);
  expect(after.slice(0, 2).map((segment) => segment.key)).toEqual(
    before.map((segment) => segment.key),
  );
});
test("segment identity is namespaced by message", () => {
  const first = assistant([content(0)]),
    second = { ...first, key: "assistant-2" },
    segments = segmentTranscript([first, second]);
  expect(new Set(segments.map((segment) => segment.key)).size).toBe(2);
});
test("a mounted body does not render the other 161 parts of its message", () => {
  const message = assistant(Array.from({ length: 162 }, (_, index) => content(index))),
    html = renderToStaticMarkup(
      <Body item={message} partIndex={80} onCancelTool={ignoreToolCancellation} />,
    );
  expect(html).toContain("fragment_80_end");
  expect(html).not.toContain("fragment_79_end");
  expect(html).not.toContain("fragment_81_end");
  expect(html.match(/<p>/g)).toHaveLength(1);
});
