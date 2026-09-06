/* oxlint-disable typescript/no-unsafe-type-assertion -- The fixture only implements the fitted element's geometry and style. */
import { expect, test } from "bun:test";
import {
  fitSourceHeight,
  observeSourceSpace,
} from "../../../src/app/frontend/components/Markdown/fittedSource";

test("fits rendered source before paint without publishing a provisional line height", () => {
  const writes: string[] = [];
  let lineHeight = "";
  const element = {
    getBoundingClientRect() {
      expect(lineHeight).toBe("1px");
      return { height: 43 };
    },
    style: {
      get lineHeight() {
        return lineHeight;
      },
      set lineHeight(value: string) {
        lineHeight = value;
        writes.push(value);
      },
    },
  } as unknown as HTMLElement;
  fitSourceHeight(element, 860);
  expect(writes).toEqual(["1px", "20px"]);
  expect(element.style.lineHeight).toBe("20px");
});
test("source fitting follows parent height growth even when its width is unchanged", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "ResizeObserver");
  let resize: ResizeObserverCallback | undefined,
    disconnected = false;
  class Observer {
    constructor(onResize: ResizeObserverCallback) {
      resize = onResize;
    }
    observe() {}
    disconnect() {
      disconnected = true;
    }
  }
  Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: Observer });
  try {
    const parent = {
        getBoundingClientRect: () => ({ height: 200, width: 400 }),
      } as unknown as HTMLElement,
      source = {
        getBoundingClientRect: () => ({ height: 20 }),
        style: { lineHeight: "10px" },
      } as unknown as HTMLElement,
      stop = observeSourceSpace(parent, source);
    if (!resize) {
      throw new Error("ResizeObserver 替身未收到回调");
    }
    resize(
      [{ contentRect: { height: 400, width: 400 } }] as unknown as ResizeObserverEntry[],
      {} as ResizeObserver,
    );
    expect(source.style.lineHeight).toBe("20px");
    stop();
    expect(disconnected).toBeTrue();
  } finally {
    if (original) {
      Object.defineProperty(globalThis, "ResizeObserver", original);
    } else {
      Reflect.deleteProperty(globalThis, "ResizeObserver");
    }
  }
});
