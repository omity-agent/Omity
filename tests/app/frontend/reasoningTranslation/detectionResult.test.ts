import {
  UnsupportedLanguagePairError,
  createBrowserTranslator,
} from "../../../../src/app/frontend/services/translation/browser";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mockBuiltInAi } from "./mockBuiltInAi";

let browser: ReturnType<typeof mockBuiltInAi>;
beforeEach(() => {
  browser = mockBuiltInAi();
});
afterEach(() => {
  browser.restore();
});
test("unsupported language pairs preserve the detection confidence", async () => {
  browser.detect.mockResolvedValueOnce([{ confidence: 0.37, detectedLanguage: "fr" }]);
  browser.availability.mockResolvedValueOnce("unavailable");
  const result = createBrowserTranslator("zh-CN", "short");
  expect(result).rejects.toBeInstanceOf(UnsupportedLanguagePairError);
  expect(result).rejects.toMatchObject({
    confidence: 0.37,
    sourceLanguage: "fr",
    targetLanguage: "zh-CN",
  });
  expect(browser.destroyDetector).toHaveBeenCalledTimes(1);
  expect(browser.createTranslator).not.toHaveBeenCalled();
});
test("matching base languages skip translation without an unsupported-pair result", async () => {
  browser.detect.mockResolvedValueOnce([{ confidence: 1, detectedLanguage: "zh" }]);
  const translator = await createBrowserTranslator("zh-CN", "中文");
  expect(translator.translate("中文")).resolves.toBeNull();
  expect(browser.availability).not.toHaveBeenCalled();
  expect(browser.createTranslator).not.toHaveBeenCalled();
  expect(browser.destroyDetector).toHaveBeenCalledTimes(1);
});
test("detectors are destroyed after detection fails", async () => {
  const failure = new Error("detection failed");
  browser.detect.mockRejectedValueOnce(failure);
  expect(createBrowserTranslator("zh-CN", "short")).rejects.toBe(failure);
  expect(browser.destroyDetector).toHaveBeenCalledTimes(1);
  expect(browser.availability).not.toHaveBeenCalled();
});
test("empty detection results remain ordinary errors", async () => {
  browser.detect.mockResolvedValueOnce([]);
  const result = createBrowserTranslator("zh-CN", "short");
  expect(result).rejects.toBeInstanceOf(Error);
  expect(result).rejects.not.toBeInstanceOf(UnsupportedLanguagePairError);
  expect(browser.destroyDetector).toHaveBeenCalledTimes(1);
});
test.each([Number.NaN, Number.POSITIVE_INFINITY, -0.1, 1.1])(
  "invalid confidence %s is reported rather than classified",
  async (confidence) => {
    browser.detect.mockResolvedValueOnce([{ confidence, detectedLanguage: "en" }]);
    expect(createBrowserTranslator("zh-CN", "short")).rejects.toBeInstanceOf(Error);
    expect(browser.destroyDetector).toHaveBeenCalledTimes(1);
    expect(browser.availability).not.toHaveBeenCalled();
  },
);
test("unrelated translator creation errors preserve their original identity", async () => {
  const failure = new DOMException("Model not available", "NotSupportedError");
  browser.createTranslator.mockRejectedValueOnce(failure);
  expect(createBrowserTranslator("zh-CN", "short")).rejects.toBe(failure);
});
