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
  p: { _short: "3", base: "3", md: "6" },
  w: "full",
});
export const composerActions = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  h: "full",
  justifyContent: "space-between",
  minW: { md: { _coarse: "60" } },
  w: { base: "full", md: "controlColumn" },
});
export const composerControls = css({
  "& button": { borderWidth: "1px", flexShrink: 0 },
  alignItems: "center",
  display: "flex",
  gap: "1",
  justifyContent: "flex-end",
  minH: { _coarse: "11", base: "8" },
  order: { base: 1, md: 0 },
  w: "full",
});
export const runtimeControls = css({
  display: "flex",
  flexShrink: 0,
  gap: "1",
  justifyContent: "flex-end",
  w: {
    _coarse: "calc(token(sizes.11) + token(sizes.11) + token(spacing.1))",
    base: "calc(token(sizes.8) + token(sizes.8) + token(spacing.1))",
  },
});
export const composerRole = css({
  alignItems: "center",
  color: "mutedStrong",
  display: { base: "none", md: "flex" },
  justifyContent: "flex-end",
  minH: { _coarse: "11", base: "8" },
  mt: { md: "auto" },
  pr: { _coarse: "3", base: "1.5" },
});
