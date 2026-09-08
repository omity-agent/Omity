/* oxlint-disable typescript/no-unsafe-type-assertion -- These partial browser fixtures expose only the measured geometry. */
import { expect, test } from "bun:test";
import { measureItemHeight } from "../../../src/app/frontend/services/scheduling/scrollGeometry";

function fixture() {
  const element = { getBoundingClientRect: () => ({ height: 345.5 }) } as unknown as Element;
  return { element };
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
