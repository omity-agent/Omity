import { I18nextProvider, initReactI18next } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReasoningTranslation, TimelinePart } from "../../../../src/app/timeline";
import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  reasoningTranslationKey,
  useReasoningTranslation,
} from "../../../../src/app/frontend/services/translation/useReasoningTranslation";
import { createInstance } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { transcriptKey } from "../../../../src/app/frontend/services/transcript/query";
import { translatedReasoning } from "../../../../src/app/frontend/components/Details/Reasoning";

type ReasoningPart = Extract<TimelinePart, { type: "reasoning" }>;
const i18n = createInstance(),
  part: ReasoningPart = {
    content: "A",
    messageId: "message",
    streaming: true,
    type: "reasoning",
  },
  translation: ReasoningTranslation = {
    messageId: "message",
    source: "A",
    targetLanguage: "zh-CN",
    translated: "甲",
  };
await i18n.use(initReactI18next).init({ lng: "zh-CN", resources: {} });
let client: QueryClient;
beforeEach(() => {
  client = new QueryClient();
  client.setQueryData(reasoningTranslationKey("first"), translation);
});
afterEach(() => {
  client.clear();
});
test("reentering a streaming session uses its translation on the first render", () => {
  client.setQueryData(reasoningTranslationKey("second"), {
    ...translation,
    translated: "乙",
  });
  expect(renderReasoning("first", part)).toBe("甲");
  expect(renderReasoning("second", part)).toBe("乙");
  expect(renderReasoning("first", part)).toBe("甲");
  expect(renderReasoning("untranslated", part)).toBe("A");
});
test("reentry retains the translated prefix while streaming has advanced", () => {
  expect(renderReasoning("first", { ...part, content: "A + B" })).toBe("甲 + B");
});
test.each([
  { ...part, messageId: "next-message" },
  { ...part, content: "replacement" },
  { content: "A + B", messageId: "message", type: "reasoning" as const },
])("reentry rejects a translation that no longer matches %j", (current) => {
  expect(renderReasoning("first", current)).toBe(current.content);
});
test("disabling translation does not reuse a cached live translation", () => {
  expect(renderReasoning("first", part, false)).toBe("A");
});
test("removing a session also removes its live translation", () => {
  client.removeQueries({ queryKey: transcriptKey("first") });
  expect(client.getQueryData(reasoningTranslationKey("first"))).toBeUndefined();
  expect(renderReasoning("first", part)).toBe("A");
});
function renderReasoning(sessionId: string, current: ReasoningPart, enabled = true) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <Preview enabled={enabled} part={current} sessionId={sessionId} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}
function Preview({
  enabled,
  part: current,
  sessionId,
}: {
  enabled: boolean;
  part: ReasoningPart;
  sessionId: string;
}) {
  const live = useReasoningTranslation(
    sessionId,
    [
      {
        content: "",
        createdAt: 0,
        id: -1,
        key: "stream-message",
        parts: [current],
        role: "assistant",
      },
    ],
    { enabled, highConfidenceThreshold: 0.8, minimumIntervalMs: 0 },
  );
  return translatedReasoning(current, ["zh-CN"], live);
}
