import { type ReactNode, createContext, useContext, useEffect, useState } from "react";

const SourceModeContext = createContext(false);
export function MarkdownModeProvider({ children }: { children: ReactNode }) {
  const [showSource, setShowSource] = useState(false);
  useEffect(() => {
    const updateModifiers = (event: KeyboardEvent) => {
        setShowSource(event.ctrlKey || event.metaKey);
      },
      reset = () => {
        setShowSource(false);
      },
      handleVisibility = () => {
        if (document.visibilityState === "hidden") {
          reset();
        }
      };
    globalThis.addEventListener("keydown", updateModifiers, true);
    globalThis.addEventListener("keyup", updateModifiers, true);
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      globalThis.removeEventListener("keydown", updateModifiers, true);
      globalThis.removeEventListener("keyup", updateModifiers, true);
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);
  return <SourceModeContext.Provider value={showSource}>{children}</SourceModeContext.Provider>;
}
export function useMarkdownSource() {
  return useContext(SourceModeContext);
}
