import { useCallback, useState } from "react";

interface AnswerState {
  callId?: string;
  note: string;
  options: string[];
}
const emptyAnswer: AnswerState = { note: "", options: [] };
export function useQuestionAnswerState(callId?: string) {
  const [stored, setStored] = useState<AnswerState>(emptyAnswer),
    current = stored.callId === callId ? stored : emptyAnswer,
    setNote = useCallback(
      (note: string) => {
        setStored((value) => ({
          callId,
          note,
          options: value.callId === callId ? value.options : [],
        }));
      },
      [callId, setStored],
    ),
    setOptions = useCallback(
      (options: string[]) => {
        setStored((value) => ({
          callId,
          note: value.callId === callId ? value.note : "",
          options,
        }));
      },
      [callId, setStored],
    ),
    clear = useCallback(() => {
      setStored(emptyAnswer);
    }, [setStored]);
  return {
    clear,
    handleNoteChange: setNote,
    handleOptionsChange: setOptions,
    note: current.note,
    options: current.options,
  };
}
