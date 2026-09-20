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
test("appending parts preserves the identities of existing virtual rows", () => {
  const message = assistant([content(0), content(1)]),
    before = segmentTranscript([message]),
    after = segmentTranscript([{ ...message, parts: [...message.parts, content(2)] }]);
  expect(after.slice(0, 2).map((segment) => segment.key)).toEqual(
    before.map((segment) => segment.key),
  );
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
