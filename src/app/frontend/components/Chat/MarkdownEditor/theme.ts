/* oxlint-disable @pandacss/no-descendant-selectors -- CodeMirror owns the nested editor DOM. */
import { EditorView } from "@codemirror/view";
import { css } from "styled-system/css";

export const root = css({
  _focusWithin: {
    outlineColor: "mutedStrong",
    outlineOffset: "0.5",
    outlineStyle: "solid",
    outlineWidth: "hairline",
  },
  background: "surfaceInset",
  borderColor: "lineStrong",
  borderWidth: "hairline",
  minWidth: "zero",
  overflow: "hidden",
});
export const fixedRoot = css({
  height: "composerEditor",
  maxHeight: { _short: "editorShort", smDown: "editorCompact" },
});
export const fillRoot = css({
  alignSelf: "stretch",
  height: "full",
  minHeight: "zero",
});
export const disabledRoot = css({
  borderColor: "line",
  opacity: 0.65,
});
export const bareRoot = css({
  _focusWithin: { outlineOffset: "focusInset" },
  alignSelf: "start",
  borderWidth: "zero",
});
export const codeMirror = css({ cursor: "text" });
export const fixedCodeMirror = css({
  "& > .cm-editor": { height: "full" },
  height: "full",
});
export const editorTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "var(--colors-surface)",
      color: "var(--colors-text)",
      fontFamily: "var(--fonts-mono)",
      fontSize: "var(--font-sizes-editor)",
    },
    ".cm-activeLine": {
      backgroundColor: "var(--colors-active-line)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "var(--colors-control)",
    },
    ".cm-content": {
      caretColor: "var(--colors-text)",
      lineHeight: "1.6",
      padding: "10px 0",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--colors-text)",
    },
    ".cm-gutters": {
      backgroundColor: "var(--colors-control)",
      borderRight: "1px solid var(--colors-line)",
      color: "var(--colors-muted)",
    },
    ".cm-line": { padding: "0 12px" },
    ".cm-placeholder": {
      color: "var(--colors-muted)",
      fontStyle: "normal",
    },
    ".cm-scroller": { cursor: "text", overflow: "auto" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "var(--colors-selection)",
    },
  },
  { dark: true },
);
export const fluidTheme = EditorView.theme({
  "&": { height: "auto" },
  ".cm-content": { minHeight: "2.75rem" },
  ".cm-gutters": { color: "var(--colors-muted-strong)" },
  ".cm-placeholder": { color: "var(--colors-muted-strong)" },
  ".cm-scroller": { overflow: "visible" },
});
export const fixedTheme = EditorView.theme({
  "&": { height: "100%" },
  ".cm-content": { minHeight: "100%" },
});
