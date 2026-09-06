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
  bg: "surfaceInset",
  borderColor: "line",
  borderWidth: "1px",
  color: "text",
  display: "block",
  fontFamily: "mono",
  fontSize: "sm",
  lineHeight: "1.65",
  m: 0,
  maxH: "toolOutput",
  maxW: "full",
  minW: 0,
  overflow: "auto",
  overflowAnchor: "none",
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
  position: "relative",
  whiteSpace: "inherit",
});
export const virtualLine = css({
  display: "block",
  left: 0,
  minH: "1lh",
  position: "absolute",
  top: 0,
  w: "full",
  whiteSpace: "inherit",
});
export const widthSizer = css({
  display: "block",
  h: 0,
  overflow: "hidden",
  visibility: "hidden",
  whiteSpace: "inherit",
});
