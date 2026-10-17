import "../../../../src/app/frontend/panda.css";
import { useLayoutEffect, useMemo, useState } from "react";
import { HighlightedCode } from "../../../../src/app/frontend/components/HighlightedCode";
import type { TimelineMessage } from "../../../../src/app/timeline";
import { Transcript } from "../../../../src/app/frontend/components/Transcript";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { i18nReady } from "../../../../src/app/frontend/i18n";

declare global {
  var scrolling: { advance: () => void; revision: number };
}
const mode = new URL(location.href).searchParams.get("mode"),
  longLine = "Text that wraps into several measured lines. ".repeat(6),
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
          output: { content: code, images: [], outputTokens: revision },
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
    messages = useMemo(() => [...history, liveMessage(revision)], [revision]),
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
