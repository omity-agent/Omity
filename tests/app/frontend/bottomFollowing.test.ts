import { expect, test } from "bun:test";
import { FollowBottomController } from "../../../src/app/frontend/components/Transcript/followBottom";

test("keeps following the bottom while transcript layout height settles", () => {
  const controller = new FollowBottomController(),
    viewport = { clientHeight: 600, scrollHeight: 1200, scrollTop: 0 };
  controller.align(viewport);
  expect(viewport.scrollTop).toBe(600);
  viewport.scrollHeight = 2400;
  controller.align(viewport);
  expect(viewport.scrollTop).toBe(1800);
});
test("preserves intentional scrolling until a different transcript resets it", () => {
  const controller = new FollowBottomController(),
    viewport = { clientHeight: 600, scrollHeight: 2400, scrollTop: 1200 };
  controller.update(viewport);
  viewport.scrollHeight = 3000;
  controller.align(viewport);
  expect(viewport.scrollTop).toBe(1200);
  controller.reset();
  controller.align(viewport);
  expect(viewport.scrollTop).toBe(2400);
});
test("delayed programmatic scroll events do not disable following after content grows", () => {
  const controller = new FollowBottomController(),
    viewport = { clientHeight: 600, scrollHeight: 1200, scrollTop: 0 };
  controller.align(viewport);
  viewport.scrollHeight = 2400;
  controller.update(viewport);
  controller.align(viewport);
  expect(viewport.scrollTop).toBe(1800);
});
test("horizontal scroll events and viewport resizing preserve follow mode", () => {
  const controller = new FollowBottomController(),
    viewport = { clientHeight: 600, scrollHeight: 2400, scrollTop: 0 };
  controller.align(viewport);
  viewport.clientHeight = 300;
  controller.update(viewport);
  controller.align(viewport);
  expect(viewport.scrollTop).toBe(2100);
});
test("manual upward scrolling pauses following until the user returns to the bottom", () => {
  const controller = new FollowBottomController(),
    viewport = { clientHeight: 600, scrollHeight: 2400, scrollTop: 0 };
  controller.align(viewport);
  viewport.scrollTop = 1200;
  controller.update(viewport);
  viewport.scrollHeight = 3000;
  controller.align(viewport);
  expect(viewport.scrollTop).toBe(1200);
  viewport.scrollTop = 2400;
  controller.update(viewport);
  viewport.scrollHeight = 3500;
  controller.align(viewport);
  expect(viewport.scrollTop).toBe(2900);
});
test("gentle upward scrolling leaves the bottom even inside the follow threshold", () => {
  const controller = new FollowBottomController(),
    viewport = { clientHeight: 600, scrollHeight: 2400, scrollTop: 0 };
  controller.align(viewport);
  viewport.scrollTop -= 0.5;
  controller.update(viewport);
  controller.update(viewport);
  controller.align(viewport);
  expect(viewport.scrollTop).toBe(1799.5);
  expect(controller.isFollowing).toBe(false);
  viewport.scrollTop -= 8;
  controller.update(viewport);
  controller.align(viewport);
  expect(viewport.scrollTop).toBe(1791.5);
  viewport.scrollTop += 8;
  controller.update(viewport);
  controller.align(viewport);
  expect(viewport.scrollTop).toBe(1800);
});
test("settled content does not rewrite the same scroll position", () => {
  let top = 0,
    writes = 0;
  const controller = new FollowBottomController(),
    viewport = {
      clientHeight: 600,
      scrollHeight: 1200,
      get scrollTop() {
        return top;
      },
      set scrollTop(value: number) {
        top = value;
        writes += 1;
      },
    };
  controller.align(viewport);
  controller.align(viewport);
  expect(top).toBe(600);
  expect(writes).toBe(1);
});
test("paused following does not read layout on content resize", () => {
  const controller = new FollowBottomController();
  controller.update({ clientHeight: 600, scrollHeight: 2400, scrollTop: 1200 });
  const viewport = {
    get clientHeight(): number {
      throw new Error("unexpected layout read");
    },
    get scrollHeight(): number {
      throw new Error("unexpected layout read");
    },
    scrollTop: 1200,
  };
  controller.align(viewport);
  expect(viewport.scrollTop).toBe(1200);
});
