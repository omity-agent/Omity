import { useLayoutEffect, useRef } from "react";
import { UserMessageHistory } from "../../Chat/Composer/history";
import { useHistoryNavigation } from "../../Chat/Composer/hooks/history";

export function useInputNavigation(
  message: string,
  onChange: (content: string) => void,
  userMessages: readonly string[],
) {
  const messageRef = useRef(message),
    historyRef = useRef(new UserMessageHistory());
  useLayoutEffect(() => {
    messageRef.current = message;
  }, [message]);
  const update = (next: string) => {
      messageRef.current = next;
      onChange(next);
    },
    change = (next: string) => {
      if (next !== messageRef.current) {
        historyRef.current.reset();
        update(next);
      }
    },
    navigateHistory = useHistoryNavigation(historyRef, messageRef, update, userMessages);
  return { change, navigateHistory };
}
