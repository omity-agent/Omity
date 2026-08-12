import { expect, test } from "bun:test";
import { translatedReasoning } from "../../../../src/app/frontend/components/Details/Reasoning";

test("shows a translated reasoning prefix with the newest untranslated suffix", () => {
  expect(
    translatedReasoning(
      {
        content: "A + B",
        messageId: "reasoning",
        streaming: true,
        translations: [],
        type: "reasoning",
      },
      ["zh-CN"],
      {
        messageId: "reasoning",
        source: "A",
        targetLanguage: "zh-CN",
        translated: "甲",
      },
    ),
  ).toBe("甲 + B");
});
