import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { highlightCode, tags } from "@lezer/highlight";
import type { HighlightedCodeResult } from "../HighlightedCode/background/dispatch";
import { commonmarkLanguage } from "@codemirror/lang-markdown";
import { css } from "styled-system/css";
import { escape as escapeHtml } from "es-toolkit";

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
  const lines = [""];
  highlightCode(
    code,
    commonmarkLanguage.parser.parse(code),
    markdownHighlight,
    (text, classes) => {
      const escaped = escapeHtml(text);
      lines[lines.length - 1] += classes ? `<span class="${classes}">${escaped}</span>` : escaped;
    },
    () => {
      lines.push("");
    },
  );
  return {
    code,
    language: "markdown",
    lines,
    sourceLines: code.split("\n"),
  };
}
