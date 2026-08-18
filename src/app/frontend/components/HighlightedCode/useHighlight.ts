import { type HighlightedCodeResult, scheduleHighlight } from "./scheduler";
import { useEffect, useState } from "react";
import { reportError } from "../../services/errors";

export function useHighlight(code: string, language?: string) {
  const [result, setResult] = useState<HighlightedCodeResult>();
  useEffect(
    () =>
      scheduleHighlight(
        { code, language },
        (highlighted) => {
          setResult(highlighted);
        },
        reportError,
      ),
    [code, language],
  );
  return result;
}
