import { expect, test } from "bun:test";
import { layoutFixture } from "./geometryFixture";

test("holds the visible footer without scrolling through stale virtual row sizes", () => {
  const { content, detail, layout, settle, state, viewport } = layoutFixture(),
    { bottom } = detail.getBoundingClientRect(),
    top = viewport.scrollTop;
  state.height = 400;
  layout.stabilize();
  expect(viewport.scrollTop).toBe(top);
  expect(content.style.translate).toBe("0 -300px");
  expect(detail.getBoundingClientRect().bottom).toBe(bottom);
  settle(400);
  layout.stabilize();
  expect(viewport.scrollTop).toBe(top + 300);
  expect(content.style.translate).toBe("");
  expect(detail.getBoundingClientRect().bottom).toBe(bottom);
  expect(layout.scroll()).toBe(false);
  layout.stabilize();
  expect(viewport.scrollTop).toBe(top + 300);
});
test("nested code measurement can change height again before the outer cache catches up", () => {
  const { detail, layout, settle, state, viewport } = layoutFixture(),
    { bottom } = detail.getBoundingClientRect(),
    top = viewport.scrollTop;
  state.height = 400;
  layout.stabilize();
  state.height = 490;
  state.cachedRow = 400;
  layout.stabilize();
  expect(viewport.scrollTop).toBe(top);
  expect(detail.getBoundingClientRect().bottom).toBe(bottom);
  settle(490);
  layout.stabilize();
  expect(viewport.scrollTop).toBe(top + 390);
  expect(detail.getBoundingClientRect().bottom).toBe(bottom);
});
test("waits for the virtual window commit as well as its row size cache", () => {
  const { content, layout, state, viewport } = layoutFixture(),
    top = viewport.scrollTop;
  state.height = 400;
  state.cachedRow = 400;
  state.total = 2300;
  layout.stabilize();
  expect(viewport.scrollTop).toBe(top);
  expect(content.style.translate).toBe("0 -300px");
  state.contentHeight = 2300;
  layout.stabilize();
  expect(viewport.scrollTop).toBe(top + 300);
});
test("collapse at the bottom updates overlay bounds before following the new bottom", () => {
  const { detail, layout, state, viewport } = layoutFixture({ following: true }),
    { bottom } = detail.getBoundingClientRect();
  state.height = 40;
  state.cachedRow = 40;
  state.total = 1940;
  state.contentHeight = 1940;
  layout.stabilize();
  expect(viewport.scrollTop).toBe(1340);
  expect(detail.getBoundingClientRect().bottom).toBe(bottom);
});
test.each([false, true])(
  "collapse away from the bottom accounts for overlay-induced scroll clamping (delayed cache: %s)",
  (delayed) => {
    const { content, detail, layout, state, viewport } = layoutFixture({ following: true });
    viewport.scrollTop -= 20;
    layout.scroll();
    layout.capture();
    const { bottom } = detail.getBoundingClientRect(),
      top = viewport.scrollTop;
    state.height = 40;
    if (delayed) {
      layout.stabilize();
      expect(detail.getBoundingClientRect().bottom).toBe(bottom);
    }
    state.cachedRow = 40;
    state.total = 1940;
    state.contentHeight = 1940;
    layout.stabilize();
    expect(viewport.scrollTop).toBe(top - 60);
    expect(content.style.translate).toBe("");
    expect(detail.getBoundingClientRect().bottom).toBe(bottom);
    expect(layout.scroll()).toBe(false);
    layout.stabilize();
    expect(viewport.scrollTop).toBe(top - 60);
  },
);
test("a virtualizer correction is not applied twice", () => {
  const { detail, layout, settle, state, viewport } = layoutFixture(),
    { bottom } = detail.getBoundingClientRect();
  state.height = 400;
  layout.stabilize();
  settle(400);
  viewport.scrollTop += 300;
  layout.stabilize();
  expect(viewport.scrollTop).toBe(600);
  expect(detail.getBoundingClientRect().bottom).toBe(bottom);
});
test("ordinary text growth and offscreen details do not pull history readers", () => {
  const { layout, state, viewport } = layoutFixture(),
    top = viewport.scrollTop;
  state.rowTop += 100;
  state.contentHeight += 100;
  state.scrollHeight += 100;
  layout.stabilize();
  expect(viewport.scrollTop).toBe(top);
  state.rowTop = 3000;
  layout.capture();
  state.height = 400;
  layout.stabilize();
  expect(viewport.scrollTop).toBe(top);
});
test("removed cards and cleanup cannot leave a temporary visual offset behind", () => {
  const { content, detail, details, layout, state } = layoutFixture();
  state.height = 400;
  layout.stabilize();
  details.delete(detail);
  Object.defineProperty(detail, "isConnected", { value: false });
  layout.stabilize();
  expect(content.style.translate).toBe("");
  expect(() => layout.release()).not.toThrow();
});
test("layout mutations before a gentle scroll event cannot pull the reader back down", () => {
  const { layout, viewport } = layoutFixture({ following: true });
  viewport.scrollTop -= 8;
  layout.stabilize();
  layout.stabilize();
  expect(viewport.scrollTop).toBe(1392);
  viewport.scrollTop -= 8;
  expect(layout.scroll()).toBe(true);
  layout.capture();
  layout.stabilize();
  expect(viewport.scrollTop).toBe(1384);
});
