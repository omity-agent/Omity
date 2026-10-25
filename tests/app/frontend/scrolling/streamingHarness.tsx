import "../../../../src/app/frontend/panda.css";
import { useLayoutEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { HighlightedCode } from "../../../../src/app/frontend/components/HighlightedCode";
import { Transcript } from "../../../../src/app/frontend/components/Transcript";
import { i18nReady } from "../../../../src/app/frontend/i18n";
import type { TimelineMessage } from "../../../../src/app/timeline";

declare global {
  var scrolling: { advance: () => void; revision: number };
}
const mode = new URL(location.href).searchParams.get("mode"),
  longLine = "Text that wraps into several measured lines. ".repeat(6),
  historicalTool: TimelineMessage = {
    content: "",
    createdAt: 99,
    id: 99,
    key: "historical-tool",
    parts: [
      {
        call: {
          id: "historical-tool",
          index: 0,
          input: {},
          inputTokens: 1,
          name: "historical",
          providerExecuted: true,
          rawInput: "{}",
        },
        key: "historical-tool",
        output: {
          content: Array.from({ length: 80 }, (_, index) => `Output ${index.toString()}`).join(
            "\n",
          ),
          images: [
            {
              mimeType: "image/svg+xml",
              src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='3000'%3E%3Crect%20width='100%25'%20height='100%25'%20fill='%23303030'/%3E%3C/svg%3E",
            },
          ],
          outputTokens: 1,
        },
        phase: "completed",
        type: "tool",
      },
    ],
    role: "assistant",
  },
  history: TimelineMessage[] = Array.from({ length: 30 }, (_, index) => {
    const content = `History ${index.toString()}\n\n${"Some example history. ".repeat(10)}`;
    return {
      content,
      createdAt: index,
      id: index + 1,
      key: `history-${index.toString()}`,
      parts: [{ content, type: "content" }],
      role: index % 2 ? "assistant" : "user",
    };
  }),
  completeAction = async () => undefined;
function liveMessage(revision: number): TimelineMessage {
  const remeasure = mode !== "append" && revision % 7 === 0,
    code = Array.from(
      { length: revision },
      (_, index) => `${index.toString()}: ${index % 5 === 0 && !remeasure ? longLine : "short"}`,
    ).join("\n"),
    message: TimelineMessage = {
      content: "",
      createdAt: 100,
      id: 100,
      key: "live",
      parts: [
        {
          content: "New streaming paragraph. ".repeat(
            mode === "timeline" && remeasure ? 2 : revision * 4,
          ),
          type: "content",
        },
        {
          call: {
            id: "tool-1",
            index: 0,
            input: {},
            inputTokens: revision,
            name: "stream",
            providerExecuted: true,
            rawInput: code,
          },
          key: "tool-1",
          output: {
            content: code,
            images:
              mode === "expand"
                ? [
                    {
                      mimeType: "image/svg+xml",
                      src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='3000'%3E%3Crect%20width='100%25'%20height='100%25'%20fill='%23303030'/%3E%3C/svg%3E",
                    },
                  ]
                : [],
            outputTokens: revision,
          },
          phase: "running",
          type: "tool",
        },
      ],
      role: "assistant",
    };
  return message;
}
function StreamingHarness() {
  const [revision, setRevision] = useState(8),
    messages = useMemo(
      () => [...history, ...(mode === "expand" ? [historicalTool] : []), liveMessage(revision)],
      [revision],
    ),
    code = messages.at(-1)?.parts.find((part) => part.type === "tool")?.call.rawInput;
  useLayoutEffect(() => {
    globalThis.scrolling = {
      advance: () => {
        flushSync(() => setRevision((current) => current + 1));
      },
      revision,
    };
  }, [revision]);
  if (code === undefined) {
    throw new Error("Scrolling fixture tool input is missing");
  }
  return (
    <>
      <Transcript
        allowFork={false}
        forkDisabled={false}
        messages={messages}
        onCancelTool={completeAction}
        onFork={completeAction}
      />
      <div id="isolated">
        <HighlightedCode autoFollow code={code} language="plaintext" />
      </div>
    </>
  );
}
await i18nReady;
const root = document.getElementById("root");
if (!root) {
  throw new Error("Scrolling fixture root is missing");
}
createRoot(root).render(<StreamingHarness />);
