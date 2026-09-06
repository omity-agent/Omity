/* oxlint-disable typescript/no-unsafe-type-assertion -- These partial browser fixtures expose only the measured geometry. */
import { expect, test } from "bun:test";
import { Virtualizer } from "@tanstack/react-virtual";
import { measureItemHeight } from "../../../src/app/frontend/services/scheduling/scrollGeometry";
import { transcriptWindow } from "../../../settings/rendering";

function fixture() {
  const virtualizer = new Virtualizer<HTMLElement, Element>({
      count: 1000,
      estimateSize: () => transcriptWindow.estimatedMessageHeight,
      getItemKey: (index) => `message-${index.toString()}`,
      getScrollElement: () => null,
      initialOffset: 1000 * transcriptWindow.estimatedMessageHeight - 600,
      initialRect: { height: 600, width: 800 },
      observeElementOffset: () => undefined,
      observeElementRect: () => undefined,
      overscan: transcriptWindow.overscan,
      scrollToFn: () => undefined,
    }),
    element = { getBoundingClientRect: () => ({ height: 345.5 }) } as unknown as Element;
  return { element, virtualizer };
}
test("mounted and updated messages supply actual geometry before paint", () => {
  const { element } = fixture();
  expect(measureItemHeight(element, undefined)).toBe(345.5);
});
test("resize entries supply accurate fractional message heights", () => {
  const element = {
      getBoundingClientRect() {
        throw new Error("unexpected synchronous layout read");
      },
    } as unknown as Element,
    entry = {
      borderBoxSize: [{ blockSize: 542.25, inlineSize: 800 }],
    } as unknown as ResizeObserverEntry;
  expect(measureItemHeight(element, entry)).toBe(542.25);
});
test("invalid resize entries fail explicitly", () => {
  const { element } = fixture();
  expect(() =>
    measureItemHeight(element, { borderBoxSize: [] } as unknown as ResizeObserverEntry),
  ).toThrow("布局观察器未提供边框尺寸");
});
test("a long initial transcript only admits the latest viewport and overscan", () => {
  const { virtualizer } = fixture(),
    items = virtualizer.getVirtualItems();
  expect(items.at(-1)?.key).toBe("message-999");
  expect(items.length).toBeLessThanOrEqual(
    Math.ceil(600 / transcriptWindow.estimatedMessageHeight) + transcriptWindow.overscan * 2,
  );
});
