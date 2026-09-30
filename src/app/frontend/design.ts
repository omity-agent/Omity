/* oxlint-disable @pandacss/no-descendant-selectors -- Responsive panels hide their layout-owned child regions. */
import { css } from "styled-system/css";

export const layout = css({
  _compact: {
    '&[data-panel="main"] > aside': { display: "none" },
    '&[data-panel="sessions"] > main': { display: "none" },
  },
  background: "canvas",
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
  height: "viewport",
  overflow: "hidden",
  paddingBlockEnd: "safeAreaBlockEnd",
  paddingBlockStart: "safeAreaBlockStart",
  paddingInlineEnd: "safeAreaInlineEnd",
  paddingInlineStart: "safeAreaInlineStart",
});
export const panelToolbar = css({
  alignItems: "center",
  background: "sidebar",
  borderBlockEndWidth: "hairline",
  borderBottomColor: "line",
  display: { base: "flex", lg: "none" },
  gap: "3",
  minWidth: "zero",
  paddingBlock: "1",
  paddingInline: "3",
});
export const panelCaption = css({
  fontSize: "interface",
  minWidth: "zero",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
export const sidebar = css({
  background: "sidebar",
  borderBlockEndWidth: "hairline",
  borderBottomColor: "line",
  borderInlineEndWidth: { _topNav: "zero", base: "zero", lg: "hairline" },
  borderRightColor: "line",
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
  minHeight: "zero",
  minWidth: "zero",
  overflow: "hidden",
  width: { _topNav: "full", lg: "appSidebar" },
});
export const main = css({
  background: "surfaceInset",
  height: "full",
  minHeight: "zero",
  minWidth: "zero",
  overflow: "hidden",
});
export const scroll = css({
  minHeight: "zero",
  overflowY: "auto",
  overscrollBehavior: "contain",
  paddingInline: { _short: "3", base: "4", md: "6" },
  scrollbarGutter: "stable",
});
