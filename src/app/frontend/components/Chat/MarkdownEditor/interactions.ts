import { EditorView, type KeyBinding, keymap } from "@codemirror/view";
import type { HistoryDirection } from "../Composer/history";
import { Prec } from "@codemirror/state";

export interface EditorHandlers {
  disabled: boolean;
  onHistoryNavigate?: (direction: HistoryDirection) => string | undefined;
  onPasteFiles?: (files: File[]) => string | undefined;
  onSubmit: () => void;
}
type ReadHandlers = () => EditorHandlers;
export class EditorHandlerStore {
  constructor(private handlers: EditorHandlers) {}
  read = () => this.handlers;
  update(handlers: EditorHandlers) {
    this.handlers = handlers;
  }
}
export function editorInteractions(readHandlers: ReadHandlers) {
  return [
    EditorView.domEventHandlers({
      paste: (event, view) => pasteFiles(event, view, readHandlers),
    }),
    Prec.highest(
      keymap.of([
        historyBinding("ArrowUp", "previous", readHandlers),
        historyBinding("ArrowDown", "next", readHandlers),
        ...emptyEditorArrowBindings,
        {
          key: "Ctrl-Enter",
          run: (view) => {
            const current = readHandlers();
            if (view.composing || current.disabled) {
              return false;
            }
            current.onSubmit();
            return true;
          },
        },
      ]),
    ),
  ];
}
function historyBinding(
  key: "ArrowDown" | "ArrowUp",
  direction: HistoryDirection,
  readHandlers: ReadHandlers,
): KeyBinding {
  return {
    key,
    run: (view) => {
      const { disabled, onHistoryNavigate } = readHandlers();
      if (view.composing || disabled || !onHistoryNavigate) {
        return false;
      }
      const nextValue = onHistoryNavigate(direction);
      if (nextValue === undefined) {
        return false;
      }
      view.dispatch({
        changes: {
          from: 0,
          insert: nextValue,
          to: view.state.doc.length,
        },
        scrollIntoView: true,
        selection: { anchor: nextValue.length },
      });
      return true;
    },
  };
}
const emptyEditorArrowBindings: KeyBinding[] = ["ArrowLeft", "ArrowRight"].map((key) => ({
  key,
  run: (view) => view.state.doc.length === 0,
}));
function pasteFiles(event: ClipboardEvent, view: EditorView, readHandlers: ReadHandlers) {
  const current = readHandlers();
  if (current.disabled || !current.onPasteFiles) {
    return false;
  }
  const files = [...(event.clipboardData?.files ?? [])];
  if (files.length === 0) {
    return false;
  }
  event.preventDefault();
  const insert = current.onPasteFiles(files);
  if (!insert) {
    return true;
  }
  const selection = view.state.selection.main,
    before = view.state.doc.sliceString(0, selection.from),
    after = view.state.doc.sliceString(selection.to),
    text =
      (before && !before.endsWith("\n") ? "\n" : "") +
      insert +
      (after && !after.startsWith("\n") ? "\n" : "");
  view.dispatch({
    changes: {
      from: selection.from,
      insert: text,
      to: selection.to,
    },
    selection: { anchor: selection.from + text.length },
  });
  return true;
}
