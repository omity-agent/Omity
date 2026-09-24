import { HighlightScheduler, type HighlightedCodeResult } from "./background/dispatch";
import { useEffect, useId, useState } from "react";
import { reportError } from "../../services/errors";

const scheduler = new HighlightScheduler(),
  hot = import.meta.hot as ImportMeta["hot"] | undefined;
hot?.dispose(() => scheduler.dispose());
export function useHighlight(code: string, language?: string) {
  const [result, setResult] = useState<HighlightedCodeResult>(),
    streamId = useId();
  useEffect(() => () => scheduler.release(streamId, reportError), [streamId]);
  useEffect(
    () =>
      scheduler.schedule(
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
