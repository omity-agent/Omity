/* oxlint-disable @pandacss/no-margin-properties -- Auto margin anchors the conversation below the setup form. */
import { css } from "styled-system/css";

export const scroll = css({
  minHeight: "zero",
  overflowY: "auto",
  overscrollBehavior: "contain",
  scrollbarGutter: "stable",
});
export const scrollContent = css({
  display: "flex",
  flexDirection: "column",
  minHeight: "full",
});
export const conversation = css({ marginBlockStart: "auto" });
export const setup = css({
  alignContent: "start",
  alignSelf: "center",
  display: "grid",
  gap: { base: "4", md: "6" },
  gridTemplateColumns: {
    base: "minmax(0, 1fr)",
    md: "repeat(2, minmax(0, 1fr))",
  },
  justifySelf: "center",
  maxWidth: "content",
  padding: { _short: "4", base: "4", md: "8" },
  width: "full",
});
export const setupFirst = css({ gridColumn: { md: "1 / -1" } });
