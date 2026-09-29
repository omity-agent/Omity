import { css } from "styled-system/css";

export const layout = css({
  _compact: {
    '&[data-panel="main"] > aside': { display: "none" },
    '&[data-panel="sessions"] > main': { display: "none" },
  },
  bg: "canvas",
  color: "text",
  display: "grid",
  fontFamily: "body",
  gridTemplateColumns: {
    _topNav: "minmax(0, 1fr)",
    base: "minmax(0, 1fr)",
    lg: "auto minmax(0, 1fr)",
  },
  gridTemplateRows: {
    _topNav: { lg: "clamp(12rem, 28dvh, 24rem) minmax(0, 1fr)" },
    base: "auto minmax(0, 1fr)",
    lg: "minmax(0, 1fr)",
  },
  h: "100dvh",
  overflow: "hidden",
  pb: "env(safe-area-inset-bottom)",
  pl: "env(safe-area-inset-left)",
  pr: "env(safe-area-inset-right)",
  pt: "env(safe-area-inset-top)",
});
export const panelToolbar = css({
  alignItems: "center",
  bg: "sidebar",
  borderBottomColor: "line",
  borderBottomWidth: "1px",
  display: { base: "flex", lg: "none" },
  gap: "3",
  minW: 0,
  px: "3",
  py: "1",
});
export const panelCaption = css({
  fontSize: "interface",
  minW: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
export const sidebar = css({
  bg: "sidebar",
  borderBottomColor: "line",
  borderBottomWidth: "1px",
  borderRightColor: "line",
  borderRightWidth: { _topNav: "0", base: "0", lg: "1px" },
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
  minH: 0,
  minW: 0,
  overflow: "hidden",
  w: { _topNav: "full", lg: "appSidebar" },
});
export const main = css({
  bg: "surfaceInset",
  h: "full",
  minH: 0,
  minW: 0,
  overflow: "hidden",
});
export const scroll = css({
  minH: 0,
  overflowY: "auto",
  overscrollBehavior: "contain",
  px: { _short: "3", base: "4", md: "6" },
  scrollbarGutter: "stable",
});
