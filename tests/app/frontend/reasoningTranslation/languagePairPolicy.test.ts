import { afterEach, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import { ReasoningTranslationCoordinator } from "../../../../src/app/frontend/services/translation/coordinator";
import { init } from "i18next";
import { mockBuiltInAi } from "./mockBuiltInAi";
import zhCN from "../../../../src/app/frontend/i18n/locales/zh-CN/app.json";

let browser: ReturnType<typeof mockBuiltInAi>,
  coordinator: ReasoningTranslationCoordinator,
  persist: ReturnType<typeof mock>,
  reportError: ReturnType<typeof mock>;
beforeAll(async () => {
  await init({ lng: "zh-CN", resources: { "zh-CN": { translation: zhCN } } });
});
beforeEach(() => {
  browser = mockBuiltInAi();
  persist = mock(() => Promise.resolve());
  reportError = mock(() => undefined);
  coordinator = new ReasoningTranslationCoordinator({
    highConfidenceThreshold: 0.8,
    minimumIntervalMs: 0,
    persist,
    reportError,
    targetLanguage: "zh-CN",
  });
});
afterEach(() => {
  coordinator.close();
  browser.restore();
});
test("low confidence warns and retries detection and translation on the next update", async () => {
  browser.detect.mockResolvedValueOnce([{ confidence: 0.79, detectedLanguage: "fr" }]);
  browser.availability.mockResolvedValueOnce("unavailable");
  coordinator.update({ content: "a", messageId: "first", streaming: true });
  await Bun.sleep(0);
  expect(browser.warning).toHaveBeenCalledWith(expect.stringContaining("下次内容更新"));
  expect(browser.createTranslator).not.toHaveBeenCalled();
  expect(reportError).not.toHaveBeenCalled();
  coordinator.update({ content: "a longer English reasoning", messageId: "first" });
  await Bun.sleep(0);
  expect(browser.detect).toHaveBeenCalledTimes(2);
  expect(browser.detect).toHaveBeenLastCalledWith(
    "a longer English reasoning",
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  expect(browser.createTranslator).toHaveBeenCalledTimes(1);
  expect(persist).toHaveBeenCalledWith(
    expect.objectContaining({
      messageId: "first",
      translated: "translated:a longer English reasoning",
    }),
  );
});
test.each([0.8, 1])("confidence %s skips only the current reasoning", async (confidence) => {
  browser.detect.mockResolvedValueOnce([{ confidence, detectedLanguage: "fr" }]);
  browser.availability.mockResolvedValueOnce("unavailable");
  coordinator.update({ content: "first", messageId: "first", streaming: true });
  await Bun.sleep(0);
  coordinator.update({ content: "first longer", messageId: "first", streaming: true });
  coordinator.update({ content: "first final", messageId: "first" });
  await Bun.sleep(0);
  expect(browser.detect).toHaveBeenCalledTimes(1);
  expect(browser.createTranslator).not.toHaveBeenCalled();
  expect(persist).not.toHaveBeenCalled();
  expect(browser.warning).toHaveBeenCalledWith(expect.stringContaining("跳过本条思维链"));
  expect(reportError).not.toHaveBeenCalled();
  coordinator.update({ content: "next reasoning", messageId: "next" });
  await Bun.sleep(0);
  expect(browser.detect).toHaveBeenCalledTimes(2);
  expect(browser.translate).toHaveBeenCalledTimes(1);
  expect(persist).toHaveBeenCalledWith(expect.objectContaining({ messageId: "next" }));
});
test("low confidence keeps an already queued update eligible", async () => {
  const detection = Promise.withResolvers<LanguageDetectionResult[]>();
  browser.detect.mockReturnValueOnce(detection.promise);
  browser.availability.mockResolvedValueOnce("unavailable");
  coordinator.update({ content: "short", messageId: "first", streaming: true });
  await Bun.sleep(0);
  coordinator.update({ content: "long enough", messageId: "first" });
  detection.resolve([{ confidence: 0.3, detectedLanguage: "fr" }]);
  await Bun.sleep(0);
  expect(browser.detect).toHaveBeenCalledTimes(2);
  expect(persist).toHaveBeenCalledWith(expect.objectContaining({ source: "long enough" }));
});
test("high confidence skips an already queued update of the same reasoning", async () => {
  const detection = Promise.withResolvers<LanguageDetectionResult[]>();
  browser.detect.mockReturnValueOnce(detection.promise);
  browser.availability.mockResolvedValueOnce("unavailable");
  coordinator.update({ content: "short", messageId: "first", streaming: true });
  await Bun.sleep(0);
  coordinator.update({ content: "long enough", messageId: "first" });
  detection.resolve([{ confidence: 0.9, detectedLanguage: "fr" }]);
  await Bun.sleep(0);
  expect(browser.detect).toHaveBeenCalledTimes(1);
  expect(browser.createTranslator).not.toHaveBeenCalled();
  expect(persist).not.toHaveBeenCalled();
});
test("a late unsupported result cannot stop an already queued next reasoning", async () => {
  const detection = Promise.withResolvers<LanguageDetectionResult[]>();
  browser.detect.mockReturnValueOnce(detection.promise);
  browser.availability.mockResolvedValueOnce("unavailable");
  coordinator.update({ content: "first", messageId: "first", streaming: true });
  await Bun.sleep(0);
  coordinator.update({ content: "next reasoning", messageId: "next" });
  detection.resolve([{ confidence: 0.9, detectedLanguage: "fr" }]);
  await Bun.sleep(0);
  expect(browser.detect).toHaveBeenCalledTimes(2);
  expect(browser.createTranslator).toHaveBeenCalledTimes(1);
  expect(persist).toHaveBeenCalledWith(expect.objectContaining({ messageId: "next" }));
});
test("supported language pairs are translated even with low confidence", async () => {
  browser.detect.mockResolvedValueOnce([{ confidence: 0.3, detectedLanguage: "en" }]);
  coordinator.update({ content: "first", messageId: "first" });
  await Bun.sleep(0);
  expect(browser.translate).toHaveBeenCalledTimes(1);
  expect(persist).toHaveBeenCalledTimes(1);
  expect(browser.warning).not.toHaveBeenCalled();
});
test("repeated low-confidence failures do not stop the current or next reasoning", async () => {
  browser.detect.mockResolvedValue([{ confidence: 0.2, detectedLanguage: "fr" }]);
  browser.availability.mockResolvedValue("unavailable");
  for (const content of ["short", "longer", "complete"]) {
    coordinator.update({ content, messageId: "first", streaming: true });
    await Bun.sleep(0);
  }
  coordinator.update({ content: "next", messageId: "next" });
  await Bun.sleep(0);
  expect(browser.detect).toHaveBeenCalledTimes(4);
  expect(browser.warning).toHaveBeenCalledTimes(4);
  expect(reportError).not.toHaveBeenCalled();
  expect(persist).not.toHaveBeenCalled();
});
test("the coordinator uses the configured threshold", async () => {
  coordinator.close();
  coordinator = new ReasoningTranslationCoordinator({
    highConfidenceThreshold: 0.95,
    minimumIntervalMs: 0,
    persist,
    reportError,
    targetLanguage: "zh-CN",
  });
  browser.detect.mockResolvedValueOnce([{ confidence: 0.9, detectedLanguage: "fr" }]);
  browser.availability.mockResolvedValueOnce("unavailable");
  coordinator.update({ content: "short", messageId: "first", streaming: true });
  await Bun.sleep(0);
  coordinator.update({ content: "long enough", messageId: "first" });
  await Bun.sleep(0);
  expect(browser.detect).toHaveBeenCalledTimes(2);
  expect(persist).toHaveBeenCalledTimes(1);
});
