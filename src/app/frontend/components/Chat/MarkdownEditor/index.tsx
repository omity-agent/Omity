import { EditorHandlerStore, editorInteractions } from "./interactions";
import {
  bareRoot,
  codeMirror,
  disabledRoot,
  editorTheme,
  fillRoot,
  fixedCodeMirror,
  fixedRoot,
  fixedTheme,
  fluidTheme,
  markdownSyntax,
  root,
} from "./theme";
import { useLayoutEffect, useMemo, useReducer } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { HistoryDirection } from "../Composer/history";
import { cx } from "styled-system/css";
import { indentUnit } from "@codemirror/language";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";
import { markdown } from "@codemirror/lang-markdown";

const basicSetup = {
  autocompletion: false,
  foldGutter: false,
  highlightActiveLine: true,
  highlightActiveLineGutter: true,
  lineNumbers: true,
};
export function MarkdownEditor({
  bare = false,
  disabled,
  fill = false,
  fluid = false,
  label,
  onChange,
  onPasteFiles,
  onHistoryNavigate,
  onSubmit,
  placeholder,
  value,
}: {
  bare?: boolean;
  disabled: boolean;
  fill?: boolean;
  fluid?: boolean;
  label?: string;
  onChange: (value: string) => void;
  onPasteFiles?: (files: File[]) => string | undefined;
  onHistoryNavigate?: (direction: HistoryDirection) => string | undefined;
  onSubmit: () => void;
  placeholder: string;
  value: string;
}) {
  const [handlers] = useReducer(
    (current: EditorHandlerStore) => current,
    undefined,
    () =>
      new EditorHandlerStore({
        disabled,
        onHistoryNavigate,
        onPasteFiles,
        onSubmit,
      }),
  );
  useLayoutEffect(() => {
    handlers.update({
      disabled,
      onHistoryNavigate,
      onPasteFiles,
      onSubmit,
    });
  }, [disabled, handlers, onHistoryNavigate, onPasteFiles, onSubmit]);
  const extensions = useMemo(
    () => [
      markdown(),
      EditorState.tabSize.of(2),
      indentUnit.of("  "),
      EditorView.lineWrapping,
      indentationMarkers({
        colors: {
          activeDark: "var(--colors-muted-strong)",
          dark: "var(--colors-line-strong)",
        },
        hideFirstIndent: false,
        markerType: "fullScope",
      }),
      markdownSyntax,
      editorTheme,
      fluid ? fluidTheme : fixedTheme,
      ...editorInteractions(handlers.read),
    ],
    [fluid, handlers],
  );
  return (
    <div
      className={cx(
        root,
        !fluid && !fill && fixedRoot,
        bare && bareRoot,
        fill && fillRoot,
        disabled && disabledRoot,
      )}
    >
      <CodeMirror
        aria-label={label ?? placeholder}
        basicSetup={basicSetup}
        className={cx(codeMirror, !fluid && fixedCodeMirror)}
        editable={!disabled}
        extensions={extensions}
        height={fluid && !fill ? "auto" : "100%"}
        indentWithTab
        onChange={onChange}
        placeholder={placeholder}
        readOnly={disabled}
        theme="none"
        value={value}
      />
    </div>
  );
}
