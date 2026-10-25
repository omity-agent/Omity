import { afterAll, beforeAll, expect, test } from "bun:test";

import type { Page } from "playwright";

import type { ReasoningTranslation, TimelineMessage } from "../../../../src/app/timeline";
import { reasoningTranslationSchema } from "../../../../src/app/timeline/contracts/records";
import { BrowserSession, settleLayout } from "../scrolling/browserSession";

const session = new BrowserSession(),
  source = "First thought.",
  grown = `${source} Extra tail.`,
  translated = "已经翻译的思考。";
beforeAll(() => session.start(), 60_000);
afterAll(() => session.stop());
function message(id: string, content: string, streaming = true): TimelineMessage {
  return {
    content: "",
    createdAt: 1,
    id: id === "a" ? 1 : 2,
    key: id,
    parts: [
      { content, messageId: id, ...(streaming ? { streaming: true } : {}), type: "reasoning" },
    ],
    role: "assistant",
  };
}
async function open() {
  const saved: ReasoningTranslation[] = [],
    page = await session.openFixture(
      "/tests/app/frontend/translation/reasoningPage.html",
      async (fixture) => {
        await fixture.route("**/api/sessions/*/composer-draft", (route) =>
          route.fulfill({ json: { content: "", revision: 0 } }),
        );
        await fixture.route("**/api/sessions/*/reasoning-translation", async (route) => {
          const result = reasoningTranslationSchema.parse(route.request().postDataJSON());
          saved.push(result);
          await route.fulfill({ json: result });
        });
      },
    );
  await page.waitForFunction(() => Boolean(globalThis.translationScenario));
  return { page, saved };
}
async function render(page: Page, messages: TimelineMessage[]) {
  await page.evaluate((view) => globalThis.translationScenario.render(view), messages);
  await settleLayout(page);
}
async function complete(page: Page, text: string, result: string) {
  await page.waitForFunction(
    (value) => globalThis.translationScenario.pending.some((item) => item.source === value),
    text,
  );
  await page.evaluate(
    (value) => globalThis.translationScenario.complete(value.text, value.result),
    { result, text },
  );
  await page.waitForFunction(
    (value) => document.querySelector("section")?.textContent.includes(value),
    result,
  );
}
async function initialize(page: Page) {
  await render(page, [message("a", source)]);
  await complete(page, source, translated);
  await page.evaluate((text) => globalThis.translationScenario.watch(text), source);
}
test("settling a growing thought retains its translated prefix until the final translation", async () => {
  const { page } = await open();
  try {
    await initialize(page);
    await render(page, [message("a", grown)]);
    expect(await page.locator("section").textContent()).toContain(`${translated} Extra tail.`);
    await render(page, [message("a", grown, false)]);
    expect(await page.locator("section").textContent()).toContain(`${translated} Extra tail.`);
    await complete(page, grown, "完整译文。");
    expect(await page.evaluate(() => globalThis.translationScenario.reversions)).toEqual([]);
  } finally {
    await page.close();
  }
}, 15_000);
test("the next thought preserves the previous translation and its pending final save", async () => {
  const { page, saved } = await open();
  try {
    await initialize(page);
    await render(page, [message("a", grown)]);
    await page.waitForFunction(
      (text) => globalThis.translationScenario.pending.some((item) => item.source === text),
      grown,
    );
    await render(page, [message("a", grown, false), message("b", "Next thought.")]);
    expect(await page.locator("section").textContent()).toContain(translated);
    const persisted = page.waitForResponse(
      (response) =>
        response.url().endsWith("/reasoning-translation") &&
        response.request().postDataJSON().messageId === "a",
      { timeout: 4000 },
    );
    await complete(page, grown, "上一段的完整译文。");
    await complete(page, "Next thought.", "下一段译文。");
    await persisted;
    expect(saved.some((item) => item.messageId === "a" && item.source === grown)).toBe(true);
    expect(await page.locator("section").textContent()).toContain("上一段的完整译文。");
    expect(await page.evaluate(() => globalThis.translationScenario.reversions)).toEqual([]);
  } finally {
    await page.close();
  }
}, 15_000);
test("a completed streaming translation is saved without translating the same source again", async () => {
  const { page, saved } = await open();
  try {
    await initialize(page);
    const persisted = page.waitForResponse(
      (response) => response.url().endsWith("/reasoning-translation"),
      { timeout: 4000 },
    );
    await render(page, [message("a", source, false)]);
    await persisted;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ messageId: "a", source, translated });
    expect(await page.evaluate(() => globalThis.translationScenario.calls)).toEqual([source]);
    await render(page, [message("a", source, false), message("b", "Next thought.")]);
    await complete(page, "Next thought.", "下一段译文。");
    expect(await page.locator("section").textContent()).toContain(translated);
  } finally {
    await page.close();
  }
}, 15_000);
test("translation updates and deferred rendering never restore the original prefix", async () => {
  const { page } = await open();
  try {
    await initialize(page);
    let content = source;
    for (let revision = 0; revision < 8; revision += 1) {
      content += ` Part ${revision.toString()}.`;
      await render(page, [message("a", content)]);
      await complete(page, content, `第 ${revision.toString()} 版译文。`);
    }
    expect(await page.evaluate(() => globalThis.translationScenario.reversions)).toEqual([]);
  } finally {
    await page.close();
  }
}, 15_000);
test("an unrelated source replacement never reuses the previous translation", async () => {
  const { page } = await open();
  try {
    await initialize(page);
    await render(page, [message("a", "Replacement thought.")]);
    expect(await page.locator("section").textContent()).toContain("Replacement thought.");
    expect(await page.locator("section").textContent()).not.toContain(translated);
    await complete(page, "Replacement thought.", "替换内容的译文。");
  } finally {
    await page.close();
  }
}, 15_000);
test("session changes isolate translations and cancel unfinished work", async () => {
  const { page } = await open();
  try {
    await initialize(page);
    await render(page, [message("a", grown)]);
    await page.waitForFunction(() => globalThis.translationScenario.pending.length === 1);
    await page.evaluate(
      (view) => globalThis.translationScenario.render(view, "another-session"),
      [message("a", source)],
    );
    await settleLayout(page);
    expect(await page.locator("section").textContent()).toContain(source);
    expect(await page.locator("section").textContent()).not.toContain(translated);
    await complete(page, source, "另一个会话的译文。");
    expect(await page.evaluate(() => globalThis.translationScenario.pending)).toEqual([]);
  } finally {
    await page.close();
  }
}, 15_000);
