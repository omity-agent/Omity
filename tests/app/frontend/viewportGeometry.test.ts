/* oxlint-disable typescript/no-unsafe-type-assertion -- These partial browser fixtures expose only the properties used by asynchronous measurement. */
import { expect, test } from "bun:test";
import { Virtualizer } from "@tanstack/react-virtual";
import { measureObservedItem } from "../../../src/app/frontend/services/scheduling/observedSize";
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
    element = {
      getAttribute: () => "998",
      getBoundingClientRect() {
        throw new Error("同步读取布局");
      },
    } as unknown as Element;
  return { element, virtualizer };
}
test("unmeasured messages use estimates without forcing layout", () => {
  const { element, virtualizer } = fixture();
  expect(measureObservedItem(element, undefined, virtualizer)).toBe(
    transcriptWindow.estimatedMessageHeight,
  );
  virtualizer.itemSizeCache.set("message-998", 345.5);
  expect(measureObservedItem(element, undefined, virtualizer)).toBe(345.5);
});
test("resize entries supply accurate fractional message heights", () => {
  const { element, virtualizer } = fixture(),
    entry = {
      borderBoxSize: [{ blockSize: 542.25, inlineSize: 800 }],
    } as unknown as ResizeObserverEntry;
  expect(measureObservedItem(element, entry, virtualizer)).toBe(542.25);
});
test("invalid resize entries fail explicitly", () => {
  const { element, virtualizer } = fixture();
  expect(() =>
    measureObservedItem(
      element,
      { borderBoxSize: [] } as unknown as ResizeObserverEntry,
      virtualizer,
    ),
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
