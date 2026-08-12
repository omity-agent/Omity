import { expect, mock, test } from "bun:test";
import { ReasoningTranslationCoordinator } from "../../../../src/app/frontend/services/translation/coordinator";

test("translation coordinator persists the leading and latest trailing reasoning", async () => {
  let now = 0;
  const persisted: string[] = [],
    createTranslator = mock(() =>
      Promise.resolve({
        translate: (text: string) => Promise.resolve(`translated:${text}`),
      }),
    ),
    coordinator = new ReasoningTranslationCoordinator({
      createTranslator,
      minimumIntervalMs: 20,
      now: () => now,
      persist: (translation) => {
        persisted.push(translation.source);
        return Promise.resolve();
      },
      targetLanguage: "zh-CN",
    });
  coordinator.update({ content: "first", messageId: "message", translations: [] });
  await Bun.sleep(0);
  now = 5;
  coordinator.update({ content: "second", messageId: "message", translations: [] });
  now = 10;
  coordinator.update({ content: "final", messageId: "message", translations: [] });
  await Bun.sleep(25);
  expect(persisted).toEqual(["first", "final"]);
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
