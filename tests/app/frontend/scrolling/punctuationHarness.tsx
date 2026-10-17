import { FileLinkProvider } from "../../../../src/app/frontend/components/FileLink/context";
import type { FilePathMatch } from "../../../../src/fileLinks/types";
import { HighlightedCode } from "../../../../src/app/frontend/components/HighlightedCode";
import { HighlightedLine } from "../../../../src/app/frontend/components/HighlightedCode/lines";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { useMemo } from "react";

interface LinkedFrame {
  code: string;
  html?: string;
  language: string;
  matches: FilePathMatch[];
}
declare global {
  var renderLinkedFrame: (frame: LinkedFrame) => void;
}
function LinkedRendering({ code, html, language, matches }: LinkedFrame) {
  const highlight = useMemo(
      () =>
        html === undefined ? undefined : { code, language, lines: [html], sourceLines: [code] },
      [code, html, language],
    ),
    line = useMemo(() => ({ end: code.length, matches, start: 0, text: code }), [code, matches]);
  return (
    <FileLinkProvider sessionId="linked-punctuation">
      <pre data-controlled-line>
        <HighlightedLine appendOnly highlight={highlight} line={line} lineIndex={0} />
      </pre>
      <div data-streamed-code>
        <HighlightedCode code={code} fileLinkMatches={matches} language={language} layout="flow" />
      </div>
    </FileLinkProvider>
  );
}
const container = document.createElement("div"),
  root = createRoot(container);
container.id = "linked-rendering";
document.body.append(container);
globalThis.renderLinkedFrame = ({ code, html, language, matches }) => {
  flushSync(() => {
    root.render(<LinkedRendering code={code} html={html} language={language} matches={matches} />);
  });
};
