/* oxlint-disable typescript/no-unsafe-type-assertion -- The browser fixture only implements scrolling and its size container. */
import { expect, test } from "bun:test";
import { Virtualizer } from "@tanstack/react-virtual";
import { scrollWithMeasuredExtent } from "../../../src/app/frontend/services/scheduling/scrollGeometry";

class SizeContainer {
  style = { height: "300px" };
}
test("expanding a non-final row grows the scroll range before applying bottom compensation", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "HTMLElement");
  Object.defineProperty(globalThis, "HTMLElement", { configurable: true, value: SizeContainer });
  try {
    const container = new SizeContainer(),
      writes: { height: number; target: number }[] = [],
      viewport = {
        clientHeight: 150,
        firstElementChild: container,
        get scrollHeight() {
          return Number.parseFloat(container.style.height);
        },
        scrollTo({ top }: { top: number }) {
          writes.push({ height: this.scrollHeight, target: top });
          this.scrollTop = Math.max(0, Math.min(top, this.scrollHeight - this.clientHeight));
        },
        scrollTop: 150,
      },
      virtualizer = new Virtualizer<HTMLElement, Element>({
        anchorTo: "end",
        count: 3,
        estimateSize: () => 100,
        getScrollElement: () => viewport as unknown as HTMLElement,
        initialOffset: 150,
        initialRect: { height: 150, width: 600 },
        observeElementOffset: () => undefined,
        observeElementRect: () => undefined,
        onChange: (instance) => {
          instance.getVirtualItems();
        },
        scrollToFn: scrollWithMeasuredExtent,
      });
    virtualizer.scrollElement = viewport as unknown as HTMLElement;
    virtualizer.getVirtualItems();
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
  } finally {
    if (original) {
      Object.defineProperty(globalThis, "HTMLElement", original);
    } else {
      Reflect.deleteProperty(globalThis, "HTMLElement");
    }
  }
});
