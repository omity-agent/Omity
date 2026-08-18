import { type HighlightedCodeResult, releaseHighlightStream, scheduleHighlight } from "./scheduler";
import { useEffect, useId, useState } from "react";
import { reportError } from "../../services/errors";

export function useHighlight(code: string, language?: string) {
  const [result, setResult] = useState<HighlightedCodeResult>(),
    streamId = useId();
  useEffect(() => () => releaseHighlightStream(streamId), [streamId]);
  useEffect(
    () =>
      scheduleHighlight(
        { code, language, streamId },
        (highlighted) => {
          setResult(highlighted);
        },
        reportError,
      ),
    [code, language, streamId],
  );
  return result;
}
