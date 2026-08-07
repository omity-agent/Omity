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
  flexDirection: { base: "row", md: "column", smDown: "column" },
  gap: { base: "3", md: "0", smDown: "2" },
  h: "full",
  justifyContent: { base: "space-between", md: "initial", smDown: "initial" },
  minW: { md: "controlColumn" },
});
export const composerControls = css({
  alignItems: "center",
  display: "flex",
  gap: "1",
  justifyContent: "flex-end",
  w: "full",
});
export const runtimeControls = css({
  "& > button + button": { borderLeftWidth: "0" },
  "& > button:only-child": { w: "full" },
  display: "flex",
  justifyContent: "flex-end",
  w: {
    _coarse: "calc(token(sizes.11) + token(sizes.11))",
    base: "16",
  },
});
export const composerRole = css({
  alignItems: "center",
  color: "mutedStrong",
  display: { base: "flex", smDown: "none" },
  justifyContent: "center",
  minH: { _coarse: "11", base: "8" },
  mt: { md: "auto" },
});
