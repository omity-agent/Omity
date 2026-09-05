import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { highlightTree, tags } from "@lezer/highlight";
import type { HighlightedCodeResult } from "../HighlightedCode/background/dispatch";
import { commonmarkLanguage } from "@codemirror/lang-markdown";
import { css } from "styled-system/css";
import { escape as escapeHtml } from "es-toolkit";

interface HighlightSpan {
  classes: string;
  end: number;
  start: number;
}
const title = css({ color: "syntaxTitle", fontWeight: "bold" }),
  strong = css({ color: "syntaxNumber", fontWeight: "bold" }),
  emphasis = css({ color: "syntaxKeyword", fontStyle: "italic" }),
  link = css({ color: "syntaxMeta", textDecoration: "underline" }),
  url = css({ color: "syntaxString" }),
  monospace = css({ color: "syntaxAddition" }),
  quote = css({ color: "mutedStrong" }),
  list = css({ color: "syntaxNumber" }),
  strikethrough = css({ color: "muted", textDecoration: "line-through" }),
  meta = css({ color: "syntaxComment" }),
  separator = css({ color: "syntaxComment" }),
  markdownHighlight = HighlightStyle.define([
    { class: title, tag: tags.heading },
    { class: strong, tag: tags.strong },
    { class: emphasis, tag: tags.emphasis },
    { class: link, tag: tags.link },
    { class: url, tag: tags.url },
    { class: monospace, tag: tags.monospace },
    { class: quote, tag: tags.quote },
    { class: list, tag: tags.list },
    { class: strikethrough, tag: tags.strikethrough },
    { class: meta, tag: tags.meta },
    { class: separator, tag: tags.contentSeparator },
  ]);
export const markdownSyntax = syntaxHighlighting(markdownHighlight);
export function highlightMarkdownSource(code: string): HighlightedCodeResult {
  const spans: HighlightSpan[] = [];
  highlightTree(commonmarkLanguage.parser.parse(code), markdownHighlight, (start, end, classes) => {
    spans.push({ classes, end, start });
  });
  const sourceLines = code.split("\n"),
    lines: string[] = [];
  let start = 0;
  for (const line of sourceLines) {
    lines.push(lineMarkup(code, start, start + line.length, spans));
    start += line.length + 1;
  }
  return {
    code,
    language: "markdown",
    lines,
    sourceLines,
  };
}
function lineMarkup(code: string, start: number, end: number, spans: HighlightSpan[]) {
  let cursor = start,
    markup = "";
  for (const span of spans) {
    if (span.end > start && span.start < end) {
      const spanStart = Math.max(span.start, start),
        spanEnd = Math.min(span.end, end);
      markup += escapeHtml(code.slice(cursor, spanStart));
      markup += `<span class="${span.classes}">${escapeHtml(code.slice(spanStart, spanEnd))}</span>`;
      cursor = spanEnd;
    }
  }
  return markup + escapeHtml(code.slice(cursor, end));
}
