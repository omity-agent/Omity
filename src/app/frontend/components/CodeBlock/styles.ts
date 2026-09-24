import { css, cva } from "styled-system/css";

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
export const block = cva({
  base: {
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
    overflowAnchor: "none",
    p: "3",
    pr: "12",
  },
  defaultVariants: { layout: "contained" },
  variants: {
    layout: {
      contained: { maxH: "toolOutput", overflow: "auto", whiteSpace: "pre" },
      flow: {
        maxH: "none",
        overflow: "visible",
        overflowWrap: "anywhere",
        whiteSpace: "pre-wrap",
      },
    },
  },
});
export const codeElement = cva({
  base: {
    bg: "transparent",
    color: "text",
    display: "block",
    fontFamily: "inherit",
    fontSize: "inherit",
    lineHeight: "inherit",
    position: "relative",
    whiteSpace: "inherit",
  },
  defaultVariants: { layout: "contained" },
  variants: {
    layout: {
      contained: { minW: "fit-content" },
      flow: { minW: 0 },
    },
  },
});
export const sourceLine = css({
  display: "block",
  minH: "1lh",
  whiteSpace: "inherit",
});
export const widthSizer = css({
  display: "block",
  h: 0,
  overflow: "hidden",
  visibility: "hidden",
  whiteSpace: "inherit",
});
