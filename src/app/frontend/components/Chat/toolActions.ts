import { useCallback } from "react";

import type { SessionInfo } from "../../../sessionState";
import { answerTool, cancelTool } from "../../services/client";

export type AskUserQuestion = NonNullable<SessionInfo["askUser"]>;
export type AskUserAnswer =
  { answer: string; kind: "open_ended" } | { kind: "choice"; note: string; options: string[] };
export function useSessionToolActions(session?: SessionInfo) {
  const handleAnswer = useCallback(
      async (toolCallId: string, value: AskUserAnswer) => {
        if (session) {
          await answerTool(session.id, toolCallId, value);
        }
      },
      [session],
    ),
    handleCancel = useCallback(
      async (toolCallId: string) => {
        if (session) {
          await cancelTool(session.id, toolCallId);
        }
      },
      [session],
    );
  return { handleAnswer, handleCancel };
}
