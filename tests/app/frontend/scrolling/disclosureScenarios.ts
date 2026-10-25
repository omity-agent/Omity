import { expect } from "bun:test";

import { type BrowserSession, readScrollPositions, settleLayout } from "./browserSession";

export async function collapseLatestTool(session: BrowserSession) {
  const page = await session.open("append");
  try {
    const disclosure = page.locator('[data-part="trigger"][aria-expanded]').last();
    for (const expanded of [false, true]) {
      await disclosure.click();
      await page.waitForFunction(() => document.getAnimations().length === 0);
      await settleLayout(page);
      expect(await disclosure.getAttribute("aria-expanded")).toBe(String(expanded));
      const positions = await readScrollPositions(page);
      expect(positions.filter(({ gap }) => gap > 1)).toEqual([]);
    }
  } finally {
    await page.close();
  }
}
export async function expandOffscreenTool(session: BrowserSession) {
  const page = await session.open("expand");
  try {
    const viewport = page.locator("#root > section"),
      bounds = await viewport.boundingBox();
    if (!bounds) {
      throw new Error("Timeline viewport is not visible");
    }
    await page.mouse.move(bounds.x + bounds.width - 35, bounds.y + 50);
    for (let scroll = 0; scroll < 25; scroll += 1) {
      const triggerTexts = await page.locator('button[data-part="trigger"]').allTextContents();
      if (triggerTexts.includes("historical")) {
        break;
      }
      await page.mouse.wheel(0, -100);
      await settleLayout(page);
    }
    const historicalTrigger = page.locator('button[data-part="trigger"]').first(),
      historicalBounds = await historicalTrigger.boundingBox();
    if (!historicalBounds) {
      throw new Error("Historical tool trigger is not visible");
    }
    await historicalTrigger.click();
    await page.waitForTimeout(250);
    await settleLayout(page);
    const state = await page.evaluate(() => {
      const timeline = document.querySelector("#root > section"),
        trigger = document.querySelector('button[data-part="trigger"]'),
        content = trigger?.parentElement?.parentElement?.querySelector('[data-part="content"]');
      if (!timeline || !trigger || !content) {
        throw new Error("Historical tool did not mount its disclosure content");
      }
      const viewportRect = timeline.getBoundingClientRect(),
        contentRect = content.getBoundingClientRect();
      return {
        contentHeight: contentRect.height,
        contentVisible:
          contentRect.bottom > viewportRect.top && contentRect.top < viewportRect.bottom,
      };
    });
    expect(state.contentHeight).toBeGreaterThan(0);
    expect(state.contentVisible).toBe(true);
  } finally {
    await page.close();
  }
}
export async function expandTallTool(session: BrowserSession) {
  const page = await session.open("expand");
  try {
    const latestTrigger = page.locator('button[data-part="trigger"]').last();
    await latestTrigger.click();
    await page.waitForTimeout(500);
    await settleLayout(page);
    await latestTrigger.click();
    await page.waitForTimeout(500);
    await settleLayout(page);
    const state = await page.evaluate(() => {
      const timeline = document.querySelector("#root > section"),
        triggerCandidate = [...document.querySelectorAll('button[data-part="trigger"]')].find(
          (element) => element.textContent === "stream",
        );
      if (!timeline || !triggerCandidate) {
        throw new Error("Tall tool did not mount its disclosure content");
      }
      const row = triggerCandidate.closest("[data-transcript-index]"),
        content = row?.querySelector('[data-part="content"]');
      if (!row || !content) {
        throw new Error("Tall tool did not mount its disclosure content");
      }
      const viewport = timeline.getBoundingClientRect(),
        contentRect = content.getBoundingClientRect();
      return {
        contentHeight: contentRect.height,
        contentVisible: contentRect.bottom > viewport.top && contentRect.top < viewport.bottom,
        rowHeight: row.getBoundingClientRect().height,
      };
    });
    expect(state.rowHeight).toBeGreaterThan(600);
    expect(state.contentHeight).toBeGreaterThan(600);
    expect(state.contentVisible).toBe(true);
  } finally {
    await page.close();
  }
}
