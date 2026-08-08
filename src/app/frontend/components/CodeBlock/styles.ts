import { css } from "styled-system/css";

export const container = css({
  maxW: "full",
  minW: 0,
  position: "relative",
});
export const copyButton = css({
  position: "absolute",
  right: "2",
  top: "2",
  zIndex: "1",
});
export const block = css({
  "& .hljs-addition": { color: "syntaxAddition" },
  "& .hljs-attr, & .hljs-attribute, & .hljs-property": {
    color: "syntaxProperty",
  },
  "& .hljs-comment, & .hljs-quote": {
    color: "syntaxComment",
    fontStyle: "italic",
  },
  "& .hljs-deletion": { color: "syntaxDeletion" },
  "& .hljs-keyword, & .hljs-selector-tag, & .hljs-built_in": {
    color: "syntaxKeyword",
  },
  "& .hljs-meta, & .hljs-doctag": { color: "syntaxMeta" },
  "& .hljs-number, & .hljs-literal, & .hljs-symbol": {
    color: "syntaxNumber",
  },
  "& .hljs-string, & .hljs-regexp, & .hljs-template-variable": {
    color: "syntaxString",
  },
  "& .hljs-title, & .hljs-title.function_, & .hljs-title.class_": {
    color: "syntaxTitle",
  },
  bg: "surfaceInset",
  borderColor: "line",
  borderWidth: "1px",
  color: "text",
  display: "block",
  fontFamily: "mono",
  fontSize: "sm",
  lineHeight: "1.65",
  m: 0,
  maxW: "full",
  minW: 0,
  overflow: "auto",
  p: "3",
  pr: "12",
  whiteSpace: "pre",
});
export const codeElement = css({
  bg: "transparent",
  color: "text",
  display: "block",
  fontFamily: "inherit",
  fontSize: "inherit",
  lineHeight: "inherit",
  minW: "fit-content",
  whiteSpace: "inherit",
});
