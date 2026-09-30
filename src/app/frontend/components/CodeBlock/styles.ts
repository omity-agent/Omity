import { css, cva } from "styled-system/css";

export const container = css({
  maxWidth: "full",
  minWidth: "zero",
  position: "relative",
});
export const copyButton = css({
  insetBlockStart: "2",
  insetInlineEnd: "2",
  position: "absolute",
  zIndex: "base",
});
export const block = cva({
  base: {
    background: "surfaceInset",
    borderColor: "line",
    borderWidth: "hairline",
    color: "text",
    display: "block",
    maxWidth: "full",
    minWidth: "zero",
    overflowAnchor: "none",
    paddingBlock: "3",
    paddingInlineEnd: "12",
    paddingInlineStart: "3",
    textStyle: "codeBlock",
  },
  defaultVariants: { layout: "contained" },
  variants: {
    layout: {
      contained: { maxHeight: "toolOutput", overflow: "auto", whiteSpace: "pre" },
      flow: {
        maxHeight: "unbounded",
        overflow: "visible",
        overflowWrap: "anywhere",
        whiteSpace: "pre-wrap",
      },
    },
  },
});
export const codeElement = cva({
  base: {
    background: "clear",
    color: "text",
    display: "block",
    position: "relative",
    textStyle: "codeElement",
    whiteSpace: "inherit",
  },
  defaultVariants: { layout: "contained" },
  variants: {
    layout: {
      contained: { minWidth: "fitContent" },
      flow: { minWidth: "zero" },
    },
  },
});
export const sourceLine = css({
  display: "block",
  minHeight: "sourceLine",
  whiteSpace: "inherit",
});
export const widthSizer = css({
  display: "block",
  height: "zero",
  overflow: "hidden",
  visibility: "hidden",
  whiteSpace: "inherit",
});
