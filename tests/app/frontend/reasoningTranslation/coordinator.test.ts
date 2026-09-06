import { expect, mock, test } from "bun:test";
import { ReasoningTranslationCoordinator } from "../../../../src/app/frontend/services/translation/coordinator";

test("translation coordinator only persists the final reasoning", async () => {
  const displayed: string[] = [],
    persisted: string[] = [],
    createTranslator = mock(() =>
      Promise.resolve({
        translate: (text: string) => Promise.resolve(`translated:${text}`),
      }),
    ),
    coordinator = new ReasoningTranslationCoordinator({
      createTranslator,
      highConfidenceThreshold: 0.8,
      minimumIntervalMs: 10,
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
  coordinator.update({
    content: "first second",
    messageId: "message",
    streaming: true,
    translations: [],
  });
  coordinator.update({ content: "first second final", messageId: "message", translations: [] });
  await Bun.sleep(30);
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
      highConfidenceThreshold: 0.8,
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
test("unexpected errors stop only the current reasoning", async () => {
  const failure = new DOMException("Model not available", "NotSupportedError"),
    createTranslator = mock(() => Promise.reject(failure)),
    reportError = mock((_error: unknown) => undefined),
    coordinator = new ReasoningTranslationCoordinator({
      createTranslator,
      highConfidenceThreshold: 0.8,
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
  coordinator.update({ content: "next reasoning", messageId: "next", streaming: true });
  await Bun.sleep(0);
  expect(createTranslator).toHaveBeenCalledTimes(2);
  expect(reportError).toHaveBeenCalledTimes(2);
  coordinator.close();
});
