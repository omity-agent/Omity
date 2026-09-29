import { css } from "styled-system/css";

export const composerFrame = css({
  bg: "surface",
  borderTopColor: "line",
  borderTopWidth: "1px",
  display: "grid",
  gap: { _short: "2", base: "3" },
  gridTemplateColumns: {
    base: "minmax(0, 1fr)",
    md: "minmax(0, 1fr) auto",
  },
  p: { _short: "2", base: "3", lg: "6", md: "4" },
  w: "full",
});
export const composerActions = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  h: "full",
  justifyContent: "space-between",
  minW: 0,
  w: { base: "full", md: "calc(5 * token(sizes.controlTarget) + 4 * token(spacing.1))" },
});
export const composerControls = css({
  "& button": { borderWidth: "1px", flexShrink: 0 },
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: "1",
  justifyContent: "flex-end",
  minH: "controlTarget",
  order: { base: 1, md: 0 },
  w: "full",
});
export const runtimeControls = css({
  display: "flex",
  flexShrink: 0,
  gap: "1",
  justifyContent: "flex-end",
  w: "calc(2 * token(sizes.controlTarget) + token(spacing.1))",
});
export const composerRole = css({
  alignItems: "center",
  color: "mutedStrong",
  display: { base: "none", md: "flex" },
  justifyContent: "flex-end",
  minH: "controlTarget",
  mt: { md: "auto" },
  pr: { _coarse: "3", base: "1.5" },
});
