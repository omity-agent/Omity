/* oxlint-disable typescript/no-unsafe-type-assertion -- The browser fixture only implements scrolling and its size container. */
import { describe, expect, test } from "bun:test";
import {
  scrollWithMeasuredExtent,
  shouldAnchorResize,
} from "../../../src/app/frontend/services/scheduling/scrollGeometry";
import { Virtualizer } from "@tanstack/react-virtual";

class SizeContainer {
  style = { height: "300px" };
}
function withViewport(
  height: number,
  verify: (fixture: {
    viewport: { clientHeight: number; scrollHeight: number; scrollTop: number };
    virtualizer: Virtualizer<HTMLElement, Element>;
    writes: { height: number; target: number }[];
  }) => void,
) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "HTMLElement");
  Object.defineProperty(globalThis, "HTMLElement", { configurable: true, value: SizeContainer });
  try {
    const container = new SizeContainer(),
      writes: { height: number; target: number }[] = [],
      viewport = {
        clientHeight: height,
        firstElementChild: container,
        get scrollHeight() {
          return Math.max(this.clientHeight, Number.parseFloat(container.style.height));
        },
        scrollTo({ top }: { top: number }) {
          writes.push({ height: this.scrollHeight, target: top });
          this.scrollTop = Math.max(0, Math.min(top, this.scrollHeight - this.clientHeight));
        },
        scrollTop: Math.max(0, 300 - height),
      },
      virtualizer = new Virtualizer<HTMLElement, Element>({
        anchorTo: "end",
        count: 3,
        estimateSize: () => 100,
        getScrollElement: () => viewport as unknown as HTMLElement,
        initialOffset: viewport.scrollTop,
        initialRect: { height, width: 600 },
        observeElementOffset: () => undefined,
        observeElementRect: () => undefined,
        onChange: (instance) => {
          instance.getVirtualItems();
        },
        scrollToFn: scrollWithMeasuredExtent,
      });
    virtualizer.scrollElement = viewport as unknown as HTMLElement;
    virtualizer.getVirtualItems();
    verify({ viewport, virtualizer, writes });
  } finally {
    if (original) {
      Object.defineProperty(globalThis, "HTMLElement", original);
    } else {
      Reflect.deleteProperty(globalThis, "HTMLElement");
    }
  }
}
test("expanding a non-final row grows the scroll range before applying bottom compensation", () => {
  withViewport(150, ({ viewport, virtualizer, writes }) => {
    virtualizer.resizeItem(1, 400);
    // Virtualizer may retry compensation after the scroll range grows.
    expect(writes.length).toBeGreaterThan(0);
    for (const write of writes) {
      expect(write).toEqual({ height: 600, target: 450 });
    }
    expect(viewport.scrollTop).toBe(450);
    expect(virtualizer.scrollOffset).toBe(viewport.scrollTop);
    expect(viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop).toBe(0);
    writes.length = 0;
    virtualizer.resizeItem(1, 100);
    expect(writes.length).toBeGreaterThan(0);
    for (const write of writes) {
      expect(write).toEqual({ height: 300, target: 150 });
    }
    expect(viewport.scrollTop).toBe(150);
    expect(virtualizer.scrollOffset).toBe(viewport.scrollTop);
    expect(viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop).toBe(0);
  });
});
describe("measured scroll bounds", () => {
  test("tool output growing beyond a previously unscrollable viewport keeps visible rows mounted", () => {
    withViewport(500, ({ viewport, virtualizer }) => {
      virtualizer.resizeItem(2, 400);
      expect(viewport.scrollTop).toBe(100);
      expect(virtualizer.scrollOffset).toBe(100);
      expect(virtualizer.range?.startIndex).toBe(1);
      virtualizer.resizeItem(2, 100);
      expect(viewport.scrollTop).toBe(0);
      expect(virtualizer.scrollOffset).toBe(0);
      virtualizer.resizeItem(2, 400);
      expect(virtualizer.scrollOffset).toBe(100);
    });
  });
  test("growth that still fits the viewport leaves no unreachable offset", () => {
    withViewport(800, ({ viewport, virtualizer }) => {
      virtualizer.resizeItem(1, 400);
      expect(viewport.scrollTop).toBe(0);
      expect(virtualizer.scrollOffset).toBe(0);
      expect(virtualizer.range?.startIndex).toBe(0);
    });
  });
  test("a stale offset after shrinking the list cannot be replayed on later output", () => {
    withViewport(150, ({ viewport, virtualizer, writes }) => {
      virtualizer.scrollOffset = 400;
      virtualizer.resizeItem(1, 400);
      expect(viewport.scrollTop).toBe(450);
      expect(virtualizer.scrollOffset).toBe(450);
      expect(writes.every((write) => write.target <= 450)).toBe(true);
    });
  });
});
describe("detail footer anchoring", () => {
  test("an unpinned visible detail expands upward and collapses back after scrolling up", () => {
    withViewport(150, ({ viewport, virtualizer }) => {
      virtualizer.scrollOffset = 30;
      viewport.scrollTop = 30;
      virtualizer.scrollDirection = "backward";
      virtualizer.itemSizeCache.set(1, 100);
      virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item, _delta, instance) =>
        shouldAnchorResize(item, instance, true);
      const footer = () => virtualizer.measurementsCache[1]!.end - viewport.scrollTop,
        before = footer();
      virtualizer.resizeItem(1, 400);
      expect(viewport.scrollTop).toBe(330);
      expect(footer()).toBe(before);
      expect(virtualizer.getDistanceFromEnd()).toBe(120);
      virtualizer.resizeItem(1, 100);
      expect(viewport.scrollTop).toBe(30);
      expect(footer()).toBe(before);
    });
  });
  test("ordinary text spanning the viewport does not drag a history reader on growth", () => {
    withViewport(150, ({ viewport, virtualizer }) => {
      virtualizer.scrollOffset = 30;
      viewport.scrollTop = 30;
      virtualizer.itemSizeCache.set(0, 100);
      virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item, _delta, instance) =>
        shouldAnchorResize(item, instance, false);
      virtualizer.resizeItem(0, 400);
      expect(viewport.scrollTop).toBe(30);
    });
  });
  test("details below the viewport do not move a history reader", () => {
    withViewport(50, ({ viewport, virtualizer }) => {
      virtualizer.scrollOffset = 30;
      viewport.scrollTop = 30;
      virtualizer.itemSizeCache.set(1, 100);
      virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item, _delta, instance) =>
        shouldAnchorResize(item, instance, true);
      virtualizer.resizeItem(1, 400);
      expect(viewport.scrollTop).toBe(30);
    });
  });
});
