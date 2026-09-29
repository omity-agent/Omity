import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { compactViewport } from "../../../../../settings/appearance";

function subscribe(listener: () => void) {
  const query = globalThis.matchMedia(compactViewport);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
function snapshot() {
  return globalThis.matchMedia(compactViewport).matches;
}
export function usePanelNavigation(pageKey: string) {
  const compact = useSyncExternalStore(subscribe, snapshot),
    [selection, setSelection] = useState({ pageKey, showSessions: false }),
    buttonRef = useRef<HTMLButtonElement>(null),
    showMain = useCallback(() => {
      setSelection({ pageKey, showSessions: false });
      if (compact) {
        buttonRef.current?.focus({ preventScroll: true });
      }
    }, [compact, pageKey, setSelection]),
    toggle = useCallback(() => {
      setSelection((value) => ({ pageKey, showSessions: !value.showSessions }));
    }, [pageKey, setSelection]);
  if (selection.pageKey !== pageKey) {
    setSelection({ pageKey, showSessions: false });
  }
  return {
    buttonRef,
    showMain,
    showSessions: compact && selection.pageKey === pageKey && selection.showSessions,
    toggle,
  };
}
