import { useCallback, useLayoutEffect, useRef } from "react";
import type { UserInputPrediction } from "../prediction";

export function usePredictionNavigation(
  predictionRef: { current: UserInputPrediction },
  contentRef: { current: string },
  updateContent: (content: string) => void,
  predictions: readonly string[],
) {
  const predictionsRef = useRef(predictions);
  useLayoutEffect(() => {
    predictionsRef.current = predictions;
  }, [predictions]);
  return useCallback(() => {
    const nextContent = predictionRef.current.navigate(contentRef.current, predictionsRef.current);
    if (nextContent === undefined) {
      return undefined;
    }
    updateContent(nextContent);
    return nextContent;
  }, [contentRef, predictionRef, updateContent]);
}
