import { afterAll, beforeAll, expect, test } from "bun:test";

import { BrowserSession, readScrollPositions, settleLayout } from "./browserSession";
import { collapseLatestTool, expandOffscreenTool, expandTallTool } from "./disclosureScenarios";

const session = new BrowserSession();
beforeAll(() => session.start(), 60_000);
afterAll(() => session.stop());
test.each(["tools", "timeline"])(
  "virtual %s keep following through streaming remeasurement without user input",
  async (mode) => {
    const page = await session.open(mode),
      errors: Error[] = [];
    page.on("pageerror", (error) => errors.push(error));
    try {
      for (let revision = 9; revision <= 58; revision += 1) {
        await page.evaluate(() => globalThis.scrolling.advance());
        await settleLayout(page);
        const positions = await readScrollPositions(page);
        expect(positions.filter(({ gap }) => gap > 1)).toEqual([]);
        expect(positions).toHaveLength(4);
      }
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  },
  30_000,
);
test("scrolling up a tool pauses only that panel and returning to the bottom resumes it", async () => {
  const page = await session.open("append");
  try {
    const panel = page.locator("pre").first();
    await panel.hover();
    await page.mouse.wheel(0, -160);
    await settleLayout(page);
    const top = await panel.evaluate((element) => element.scrollTop);
    for (let update = 0; update < 5; update += 1) {
      await page.evaluate(() => globalThis.scrolling.advance());
      await settleLayout(page);
    }
    expect(await panel.evaluate((element) => element.scrollTop)).toBeCloseTo(top, 0);
    const pausedPositions = await readScrollPositions(page);
    expect(pausedPositions[0]?.gap).toBeLessThanOrEqual(1);
    await panel.hover();
    await page.mouse.wheel(0, 100_000);
    await settleLayout(page);
    await page.evaluate(() => globalThis.scrolling.advance());
    await settleLayout(page);
    const resumedPositions = await readScrollPositions(page);
    expect(resumedPositions.every(({ gap }) => gap <= 1)).toBe(true);
  } finally {
    await page.close();
  }
}, 30_000);
test.each(["wheel", "keyboard", "scrollbar"])(
  "intentional timeline scrolling with %s remains paused until returning to the bottom",
  async (input) => {
    const page = await session.open("append");
    try {
      const viewport = page.locator("#root > section"),
        bounds = await viewport.boundingBox();
      if (!bounds) {
        throw new Error("Timeline viewport is not visible");
      }
      const x = bounds.x + bounds.width - 35,
        y = bounds.y + bounds.height / 2;
      if (input === "wheel") {
        await page.mouse.move(x, y);
        await page.mouse.wheel(0, -240);
      } else if (input === "keyboard") {
        await page.mouse.click(x, y);
        await page.keyboard.press("PageUp");
      } else {
        const scrollbarX = bounds.x + bounds.width - 5;
        await page.mouse.move(scrollbarX, bounds.y + bounds.height - 35);
        await page.mouse.down();
        await page.mouse.move(scrollbarX, bounds.y + bounds.height - 200, { steps: 10 });
        const escaped = await viewport.evaluate((element) => ({
          maximum: element.scrollHeight - element.clientHeight,
          top: element.scrollTop,
        }));
        expect(escaped.top).toBeLessThan(escaped.maximum - 1);
        await page.mouse.up();
      }
      await settleLayout(page);
      await settleLayout(page);
      const initial = await readScrollPositions(page);
      expect(initial[0]?.gap).toBeGreaterThan(1);
      for (let update = 0; update < 3; update += 1) {
        await page.evaluate(() => globalThis.scrolling.advance());
        await settleLayout(page);
      }
      const paused = await readScrollPositions(page);
      expect(paused[0]?.gap).toBeGreaterThan(1);
      await page.mouse.move(x, y);
      await page.mouse.wheel(0, 100_000);
      await settleLayout(page);
      await page.evaluate(() => globalThis.scrolling.advance());
      await settleLayout(page);
      const resumed = await readScrollPositions(page);
      expect(resumed.filter(({ gap }) => gap > 1)).toEqual([]);
    } finally {
      await page.close();
    }
  },
  30_000,
);
test("wrapping code after viewport resizes preserves bottom following", async () => {
  const page = await session.open("append");
  try {
    for (const width of [900, 1680, 1200, 1440]) {
      await page.setViewportSize({ height: 900, width });
      await settleLayout(page);
      const positions = await readScrollPositions(page);
      expect(positions.filter(({ gap }) => gap > 1)).toEqual([]);
    }
  } finally {
    await page.close();
  }
}, 30_000);
test(
  "collapsing and expanding the latest tool keeps the timeline and panels at the bottom",
  () => collapseLatestTool(session),
  30_000,
);
test(
  "expanding a tool whose top is above the viewport keeps its output mounted",
  () => expandOffscreenTool(session),
  30_000,
);
test(
  "expanding a tall tool at the bottom keeps the visible part mounted",
  () => expandTallTool(session),
  30_000,
);
