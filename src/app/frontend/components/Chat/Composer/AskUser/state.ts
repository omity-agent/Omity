import { useCallback, useState } from "react";

interface AnswerState {
  callId?: string;
  note: string;
  options: string[];
}
const emptyAnswer: AnswerState = { note: "", options: [] };
export function useQuestionAnswerState(callId?: string) {
  const [stored, setStored] = useState<AnswerState>(emptyAnswer);
  const current = stored.callId === callId ? stored : emptyAnswer;
  const setNote = useCallback(
    (note: string) => {
      setStored((value) => ({
        callId,
        note,
        options: value.callId === callId ? value.options : [],
      }));
    },
    [callId],
  );
  const setOptions = useCallback(
    (options: string[]) => {
      setStored((value) => ({
        callId,
        note: value.callId === callId ? value.note : "",
        options,
      }));
    },
    [callId],
  );
  const clear = useCallback(() => {
    setStored(emptyAnswer);
  }, []);
  return {
    clear,
    handleNoteChange: setNote,
    handleOptionsChange: setOptions,
    note: current.note,
    options: current.options,
  };
}
