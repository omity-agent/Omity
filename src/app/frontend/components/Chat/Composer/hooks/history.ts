import type { HistoryDirection, UserMessageHistory } from "../history";
import { useCallback } from "react";

export function useHistoryNavigation(
  historyRef: { current: UserMessageHistory },
  contentRef: { current: string },
  updateContent: (content: string) => void,
  userMessages: readonly string[],
) {
  return useCallback(
    (direction: HistoryDirection) => {
      const nextContent = historyRef.current.navigate(direction, contentRef.current, userMessages);
      if (nextContent === undefined) {
        return undefined;
      }
      updateContent(nextContent);
      return nextContent;
    },
    [contentRef, historyRef, updateContent, userMessages],
  );
}
