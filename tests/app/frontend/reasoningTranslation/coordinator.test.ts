import { expect, mock, test } from "bun:test";
import { ReasoningTranslationCoordinator } from "../../../../src/app/frontend/services/translation/coordinator";

test("translation coordinator only persists the final reasoning", async () => {
  let now = 0;
  const displayed: string[] = [],
    persisted: string[] = [],
    createTranslator = mock(() =>
      Promise.resolve({
        translate: (text: string) => Promise.resolve(`translated:${text}`),
      }),
    ),
    coordinator = new ReasoningTranslationCoordinator({
      createTranslator,
      minimumIntervalMs: 20,
      now: () => now,
      onTranslation: (translation) => {
        displayed.push(translation.source);
      },
      persist: (translation) => {
        persisted.push(translation.source);
        return Promise.resolve();
      },
      targetLanguage: "zh-CN",
    });
  coordinator.update({ content: "first", messageId: "message", streaming: true, translations: [] });
  await Bun.sleep(0);
  now = 5;
  coordinator.update({
    content: "first second",
    messageId: "message",
    streaming: true,
    translations: [],
  });
  now = 10;
  coordinator.update({ content: "first second final", messageId: "message", translations: [] });
  await Bun.sleep(25);
  expect(displayed).toEqual(["first", "first second final"]);
  expect(persisted).toEqual(["first second final"]);
  coordinator.close();
});
test("translation coordinator reuses a matching persisted translation", async () => {
  const persist = mock(() => Promise.resolve()),
    createTranslator = mock(() =>
      Promise.resolve({ translate: () => Promise.resolve("translated") }),
    ),
    coordinator = new ReasoningTranslationCoordinator({
      createTranslator,
      minimumIntervalMs: 0,
      persist,
      targetLanguage: "zh-CN",
    });
  coordinator.update({
    content: "complete",
    messageId: "message",
    translations: [
      {
        messageId: "message",
        source: "complete",
        targetLanguage: "zh-CN",
        translated: "完成",
      },
    ],
  });
  await Bun.sleep(0);
  expect(createTranslator).not.toHaveBeenCalled();
  expect(persist).not.toHaveBeenCalled();
  coordinator.close();
});
test("translation coordinator stops retrying after the translator becomes unavailable", async () => {
  const failure = new DOMException("Model not available", "NotSupportedError"),
    createTranslator = mock(() => Promise.reject(failure)),
    reportError = mock((_error: unknown) => undefined),
    coordinator = new ReasoningTranslationCoordinator({
      createTranslator,
      minimumIntervalMs: 0,
      persist: () => Promise.resolve(),
      reportError,
      targetLanguage: "zh-CN",
    });
  coordinator.update({ content: "first", messageId: "message", streaming: true });
  await Bun.sleep(0);
  coordinator.update({ content: "second", messageId: "message", streaming: true });
  await Bun.sleep(0);
  expect(createTranslator).toHaveBeenCalledTimes(1);
  expect(reportError).toHaveBeenCalledTimes(1);
  coordinator.close();
});
