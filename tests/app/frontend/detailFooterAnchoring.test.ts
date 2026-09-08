import {
  captureDetailFooters,
  detailScrollAdjustment,
} from "../../../src/app/frontend/components/Transcript/scrolling/detailFooters";
import { expect, test } from "bun:test";
import type { TimelineMessage } from "../../../src/app/timeline";
import { segmentTranscript } from "../../../src/app/frontend/components/Transcript/segments";

function fixture() {
  const sizes = [100, 100, 100],
    message: TimelineMessage = {
      content: "",
      createdAt: 0,
      id: 1,
      key: "message",
      parts: [
        { content: "text", type: "content" },
        { content: "details", type: "reasoning" },
        { content: "text", type: "content" },
      ],
      role: "assistant",
    },
    segments = segmentTranscript([message]),
    geometry = {
      findItemIndex(offset: number) {
        let end = 0;
        const index = sizes.findIndex((size) => {
          end += size;
          return offset < end;
        });
        return index === -1 ? sizes.length - 1 : index;
      },
      getItemOffset(index: number) {
        return sizes.slice(0, index).reduce((sum, size) => sum + size, 0);
      },
      getItemSize(index: number) {
        return sizes[index]!;
      },
    };
  return { geometry, segments, sizes };
}
test("a visible detail preserves its footer through expansion and collapse", () => {
  const { geometry, segments, sizes } = fixture(),
    before = captureDetailFooters(geometry, segments, 30, 150);
  sizes[1] = 400;
  expect(detailScrollAdjustment(before, geometry, segments, 30)).toBe(300);
  const expanded = captureDetailFooters(geometry, segments, 330, 150);
  sizes[1] = 100;
  expect(detailScrollAdjustment(expanded, geometry, segments, 330)).toBe(-300);
});
test("ordinary text growth does not pull a history reader", () => {
  const { geometry, segments, sizes } = fixture(),
    before = captureDetailFooters(geometry, segments, 30, 150);
  sizes[0] = 400;
  expect(detailScrollAdjustment(before, geometry, segments, 30)).toBe(0);
});
test("details outside the viewport do not cause compensation", () => {
  const { geometry, segments, sizes } = fixture(),
    before = captureDetailFooters(geometry, segments, 30, 50);
  expect(before).toEqual([]);
  sizes[1] = 400;
  expect(detailScrollAdjustment(before, geometry, segments, 30)).toBe(0);
});
test("scrolling already compensated by the virtualizer is not applied twice", () => {
  const { geometry, segments, sizes } = fixture(),
    before = captureDetailFooters(geometry, segments, 130, 150);
  sizes[1] = 400;
  expect(detailScrollAdjustment(before, geometry, segments, 430)).toBe(0);
});
test("replacement rows cannot inherit a previous detail anchor", () => {
  const { geometry, segments, sizes } = fixture(),
    before = captureDetailFooters(geometry, segments, 30, 150);
  segments[1] = { ...segments[1]!, key: "replacement" };
  sizes[1] = 400;
  expect(detailScrollAdjustment(before, geometry, segments, 30)).toBe(0);
});
test("empty transcripts have no detail anchors", () => {
  const { geometry } = fixture();
  expect(captureDetailFooters(geometry, [], 0, 600)).toEqual([]);
});
