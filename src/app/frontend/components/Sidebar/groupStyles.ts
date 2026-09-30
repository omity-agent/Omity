/* oxlint-disable @pandacss/no-margin-properties -- Sidebar controls use deliberate external and indicator spacing. */
import { css } from "styled-system/css";

export const root = css({
  display: "grid",
  minWidth: "zero",
});
export const header = css({
  _hover: { background: "control" },
  alignItems: "center",
  background: "sidebar",
  borderWidth: "zero",
  color: "mutedStrong",
  display: "grid",
  fontSize: "metadata",
  gap: "1.5",
  gridTemplateColumns: "auto minmax(0, 1fr) auto",
  height: "7",
  insetBlockStart: "zero",
  minHeight: "controlTarget",
  paddingInline: "2",
  position: "sticky",
  textAlign: "left",
  width: "full",
  zIndex: "base",
});
export const chevron = css({
  height: "smallIcon",
  transition: "[transform 150ms ease]",
  width: "smallIcon",
});
export const collapsedChevron = css({ transform: "rotate(-90deg)" });
export const workspaceName = css({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
export const counts = css({
  alignItems: "center",
  color: "muted",
  display: "flex",
  gap: "1.5",
});
export const runningCount = css({ color: "statusModel" });
export const sessions = css({ display: "grid", gap: "0.5", paddingBlockEnd: "2" });
export const historyToggle = css({
  _hover: { background: "control", color: "mutedStrong" },
  background: "clear",
  borderWidth: "zero",
  color: "muted",
  fontSize: "metadata",
  height: "7",
  justifyContent: "flex-start",
  marginInlineStart: "sidebarInset",
  minHeight: "controlTarget",
  paddingInline: "3",
});
export const item = css({
  _focusWithin: { background: "control" },
  _hover: { background: "control" },
  alignItems: "stretch",
  borderBlockEndWidth: "hairline",
  borderBottomColor: "line",
  borderInlineStartWidth: "accent",
  borderLeftColor: "clear",
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  minWidth: "zero",
  overflow: "hidden",
  transition: "[background 120ms ease]",
});
export const selected = css({
  _focusWithin: { background: "clear" },
  _hover: { background: "clear" },
  background: "clear",
  borderLeftColor: "text",
});
export const row = css({
  _focusVisible: {
    background: "clear",
    outline: "none",
  },
  _hover: { background: "clear" },
  background: "clear",
  borderWidth: "zero",
  display: "grid",
  fontSize: "interface",
  gap: "2",
  gridTemplateColumns: "minmax(0, 1fr) auto auto",
  height: "8",
  justifyContent: "stretch",
  minHeight: "controlTarget",
  paddingInline: "2.5",
  textAlign: "left",
  width: "full",
});
export const caption = css({
  alignItems: "center",
  color: "mutedStrong",
  display: "flex",
  letterSpacing: "caption",
  minWidth: "zero",
  overflow: "hidden",
  whiteSpace: "nowrap",
});
export const selectedCaption = css({
  color: "text",
  textStyle: "selectedCaption",
});
export const unreadCaption = css({
  _after: {
    color: "statusModel",
    content: '"●"',
    flexShrink: 0,
    fontSize: "2xs",
    marginInlineStart: "1.5",
  },
});
export const time = css({
  color: "muted",
  fontSize: "metadata",
  whiteSpace: "nowrap",
});
