import DOMPurify from "dompurify";
import type { FilePathMatch } from "../../../../fileLinks/types";
import type { HighlightedCodeResult } from "./scheduler";
import { HighlightedText } from "../FileLink/HighlightedText";
import { memo } from "react";

export interface CodeLine {
  end: number;
  matches: FilePathMatch[];
  start: number;
  text: string;
}
function HighlightedLineView({
  highlight,
  line,
  lineIndex,
}: {
  highlight?: HighlightedCodeResult;
  line: CodeLine;
  lineIndex: number;
}) {
  const html = matchingMarkup(highlight, line, lineIndex);
  if (html === undefined) {
    return line.matches.length > 0 ? (
      <HighlightedText html={escapeHtml(line.text)} matches={line.matches} />
    ) : (
      line.text
    );
  }
  const sanitized = DOMPurify.sanitize(html);
  return line.matches.length > 0 ? (
    <HighlightedText html={sanitized} matches={line.matches} />
  ) : (
    <span dangerouslySetInnerHTML={highlightedMarkup(sanitized)} />
  );
}
export const HighlightedLine = memo(HighlightedLineView);
export function codeLines(code: string, matches: FilePathMatch[]) {
  const lines: CodeLine[] = [];
  let start = 0;
  for (const text of code.split("\n")) {
    const end = start + text.length;
    lines.push({
      end,
      matches: matches.flatMap((match) =>
        match.position.start >= start && match.position.end <= end
          ? [
              {
                ...match,
                position: {
                  end: match.position.end - start,
                  start: match.position.start - start,
                },
              },
            ]
          : [],
      ),
      start,
      text,
    });
    start = end + 1;
  }
  return lines;
}
function matchingMarkup(
  highlight: HighlightedCodeResult | undefined,
  line: CodeLine,
  lineIndex: number,
) {
  if (!highlight) {
    return undefined;
  }
  const sourceLine = highlight.sourceLines[lineIndex];
  return sourceLine === line.text ? highlight.lines[lineIndex] : undefined;
}
function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function highlightedMarkup(html: string) {
  return { __html: html };
}
