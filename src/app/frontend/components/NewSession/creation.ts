import { type RefObject, type SubmitEvent, useLayoutEffect, useRef, useState } from "react";
import type { EditablePair } from "./MessageStack";
import type { InitialSessionState } from "../../../initialState";
import type { PendingAttachment } from "../../../attachments/contract";
import type { PendingAttachments } from "../Chat/Composer/attachments";
import { reportPromiseErrors } from "../../services/errors";

export function useSessionCreation({
  attachmentsRef,
  clearDraft,
  flushDraft,
  hookOverrides,
  hooksReady,
  message,
  onCreate,
  pairs,
  workspace,
}: {
  attachmentsRef: RefObject<PendingAttachments>;
  clearDraft: () => void;
  flushDraft: () => Promise<void>;
  hookOverrides: Record<string, boolean>;
  hooksReady: boolean;
  message: string;
  onCreate: (state: InitialSessionState, attachments: PendingAttachment[]) => Promise<void>;
  pairs: EditablePair[];
  workspace: string;
}) {
  "use no memo";
  const [submitting, setSubmitting] = useState(false),
    createRef = useRef(onCreate),
    draftActionsRef = useRef({ clear: clearDraft, flush: flushDraft });
  useLayoutEffect(() => {
    createRef.current = onCreate;
  }, [onCreate]);
  useLayoutEffect(() => {
    draftActionsRef.current = { clear: clearDraft, flush: flushDraft };
  }, [clearDraft, flushDraft]);
  const submit = async () => {
      const valid =
        hooksReady &&
        workspace.trim().length > 0 &&
        message.trim().length > 0 &&
        pairs.every(({ user, assistant }) => user.trim().length > 0 && assistant.trim().length > 0);
      if (!valid || submitting) {
        return;
      }
      setSubmitting(true);
      try {
        await draftActionsRef.current.flush();
        await createRef.current(
          {
            history: pairs.map(({ user, assistant }) => ({ assistant, user })),
            hookOverrides,
            message,
          },
          attachmentsRef.current.values(message),
        );
        draftActionsRef.current.clear();
      } finally {
        setSubmitting(false);
      }
    },
    handleFormSubmit = (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      reportPromiseErrors(submit());
    },
    handleSubmit = () => {
      reportPromiseErrors(submit());
    };
  return { handleFormSubmit, handleSubmit, submitting };
}
