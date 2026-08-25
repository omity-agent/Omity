import { expect, test } from "bun:test";
import { FollowBottomController } from "../../../src/app/frontend/components/TranscriptScroll";

test("keeps following the bottom while transcript layout height settles", () => {
  const controller = new FollowBottomController(),
    viewport = { clientHeight: 600, scrollHeight: 1200, scrollTop: 0 };
  controller.align(viewport);
  expect(viewport.scrollTop).toBe(1200);
  viewport.scrollHeight = 2400;
  controller.align(viewport);
  expect(viewport.scrollTop).toBe(2400);
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
  expect(viewport.scrollTop).toBe(3000);
});
