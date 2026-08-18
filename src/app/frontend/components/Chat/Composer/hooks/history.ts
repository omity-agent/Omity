import type { HistoryDirection, UserMessageHistory } from "../history";
import { useCallback, useLayoutEffect, useRef } from "react";

export function useHistoryNavigation(
  historyRef: { current: UserMessageHistory },
  contentRef: { current: string },
  updateContent: (content: string) => void,
  userMessages: readonly string[],
) {
  const messagesRef = useRef(userMessages);
  useLayoutEffect(() => {
    messagesRef.current = userMessages;
  }, [userMessages]);
  return useCallback(
    (direction: HistoryDirection) => {
      const nextContent = historyRef.current.navigate(
        direction,
        contentRef.current,
        messagesRef.current,
      );
      if (nextContent === undefined) {
        return undefined;
      }
      updateContent(nextContent);
      return nextContent;
    },
    [contentRef, historyRef, updateContent],
  );
}
