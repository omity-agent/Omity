import { css } from "styled-system/css";

export const scroll = css({
  minH: 0,
  overflowY: "auto",
  overscrollBehavior: "contain",
  scrollbarGutter: "stable",
});
export const scrollContent = css({
  display: "flex",
  flexDirection: "column",
  minH: "full",
});
export const composer = css({ mt: "auto" });
export const setup = css({
  "& > :first-child": {
    gridColumn: { md: "1 / -1" },
  },
  alignContent: "start",
  display: "grid",
  gap: "6",
  gridTemplateColumns: {
    base: "minmax(0, 1fr)",
    md: "repeat(2, minmax(0, 1fr))",
  },
  maxW: "content",
  mx: "auto",
  p: { _short: "4", base: "4", md: "8" },
  w: "full",
});
