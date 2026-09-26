import type { HistoryDirection, UserMessageHistory } from "../history";
import { useCallback, useLayoutEffect, useRef } from "react";
import type { UserInputPrediction } from "../prediction";
import { useHistoryNavigation } from "./history";

export function useSuggestionNavigation({
  contentRef,
  historyRef,
  predictionRef,
  predictions,
  updateContent,
  userMessages,
}: {
  contentRef: { current: string };
  historyRef: { current: UserMessageHistory };
  predictionRef: { current: UserInputPrediction };
  predictions: readonly string[];
  updateContent: (content: string) => void;
  userMessages: readonly string[];
}) {
  const predictionsRef = useRef(predictions),
    navigateHistory = useHistoryNavigation(historyRef, contentRef, updateContent, userMessages);
  useLayoutEffect(() => {
    predictionRef.current.reset();
    predictionsRef.current = predictions;
  }, [predictionRef, predictions]);
  const handleHistoryNavigate = useCallback(
      (direction: HistoryDirection) => {
        if (direction === "previous") {
          predictionRef.current.reset();
        }
        return navigateHistory(direction);
      },
      [navigateHistory, predictionRef],
    ),
    handlePredictionNavigate = useCallback(() => {
      if (historyRef.current.isBrowsing()) {
        return navigateHistory("next");
      }
      const nextContent = predictionRef.current.navigate(
        contentRef.current,
        predictionsRef.current,
      );
      if (nextContent === undefined) {
        return undefined;
      }
      updateContent(nextContent);
      return nextContent;
    }, [contentRef, historyRef, navigateHistory, predictionRef, updateContent]);
  return { handleHistoryNavigate, handlePredictionNavigate };
}
