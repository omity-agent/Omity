import "../../../../src/app/frontend/panda.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLayoutEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { translationFixture } from "../../../../settings/verification";
import { ChatPage } from "../../../../src/app/frontend/components/Chat/ChatPage";
import { i18nReady } from "../../../../src/app/frontend/i18n";
import type { TimelineMessage } from "../../../../src/app/timeline";

interface PendingTranslation {
  resolve: (translated: string) => void;
  source: string;
}
declare global {
  var translationScenario: {
    calls: string[];
    complete: (source: string, translated: string) => void;
    pending: PendingTranslation[];
    render: (messages: TimelineMessage[], sessionId?: string) => void;
    reversions: string[];
    watch: (source: string) => void;
  };
}
const pending: PendingTranslation[] = [],
  calls: string[] = [],
  reversions: string[] = [],
  empty: never[] = [],
  client = new QueryClient(),
  noop = async () => undefined,
  pickWorkspace = async () => null;
Object.defineProperty(navigator, "languages", { configurable: true, value: ["zh-CN"] });
Object.defineProperty(globalThis, "LanguageDetector", {
  configurable: true,
  value: {
    create: async () => ({
      destroy() {},
      detect: async () => [{ confidence: 0.99, detectedLanguage: "en" }],
    }),
  },
});
Object.defineProperty(globalThis, "Translator", {
  configurable: true,
  value: {
    availability: async () => "available",
    create: async () => ({
      translate(source: string, options?: { signal?: AbortSignal }) {
        calls.push(source);
        const { promise, reject, resolve } = Promise.withResolvers<string>(),
          item = { resolve, source };
        pending.push(item);
        options?.signal?.addEventListener(
          "abort",
          () => {
            const index = pending.indexOf(item);
            if (index !== -1) {
              pending.splice(index, 1);
            }
            reject(options.signal?.reason);
          },
          { once: true },
        );
        return promise;
      },
    }),
  },
});
function ControlledChat() {
  const [view, setView] = useState<TimelineMessage[]>([]),
    [sessionId, setSessionId] = useState("translation"),
    draftTarget = useMemo(() => ({ kind: "session" as const, sessionId }), [sessionId]);
  useLayoutEffect(() => {
    globalThis.translationScenario = {
      calls,
      complete(source, translated) {
        const index = pending.findIndex((item) => item.source === source);
        if (index === -1) {
          throw new Error(`No pending translation for ${source}`);
        }
        pending.splice(index, 1)[0]!.resolve(translated);
      },
      pending,
      render(messages, id = "translation") {
        flushSync(() => {
          setSessionId(id);
          setView(messages);
        });
      },
      reversions,
      watch(source) {
        const observer = new MutationObserver((records) => {
          for (const record of records) {
            if (record.oldValue?.startsWith(source)) {
              reversions.push(record.oldValue);
            }
          }
          if (document.querySelector("section")?.textContent.includes(source)) {
            reversions.push(source);
          }
        });
        observer.observe(document.getElementById("root")!, {
          characterData: true,
          characterDataOldValue: true,
          childList: true,
          subtree: true,
        });
      },
    };
  });
  return (
    <ChatPage
      activeId={sessionId}
      askUser={null}
      availableProfiles={empty}
      control="running"
      draftTarget={draftTarget}
      newSession={false}
      onAnswer={noop}
      onCancelTool={noop}
      onControl={noop}
      onCreate={noop}
      onFork={noop}
      onPickWorkspace={pickWorkspace}
      onProfileChange={noop}
      onSend={noop}
      onWorkspaceChange={noop}
      pausing={false}
      queue={empty}
      recentWorkspaces={empty}
      sessionStatus="streaming"
      translationSettings={translationFixture}
      userMessages={empty}
      view={view}
    />
  );
}
await i18nReady;
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <ControlledChat />
  </QueryClientProvider>,
);
