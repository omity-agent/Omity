import type { AskUserAnswer, AskUserQuestion } from "../../toolActions";
import type { ComposerDraftTarget } from "../../../../services/composerDrafts";
import type { ComposerProps } from "../props";
import type { DraftSaver } from "../../../../services/scheduling/draftSaver";
import type { PendingAttachment } from "../../../../../attachments/contract";
import type { RefObject } from "react";
import { submitMessage } from "./submit";

export function useComposerSubmit({
  askNote,
  askUser,
  attachmentValues,
  clearAttachments,
  contentRef,
  draftTarget,
  historyRef,
  onAnswer,
  onSend,
  revisionRef,
  saverRef,
  selectedOptions,
  setAskNote,
  setContent,
  setSelectedOptions,
  setSubmitting,
  submittingRef,
}: {
  askNote: string;
  askUser?: AskUserQuestion | null;
  attachmentValues: (content: string) => PendingAttachment[];
  clearAttachments: () => void;
  contentRef: RefObject<string | null>;
  draftTarget: ComposerDraftTarget;
  historyRef: RefObject<{ reset: () => void } | null>;
  onAnswer?: (callId: string, answer: AskUserAnswer) => Promise<void>;
  onSend: ComposerProps["onSend"];
  revisionRef: RefObject<number | null>;
  saverRef: RefObject<DraftSaver | undefined>;
  selectedOptions: string[];
  setAskNote: (note: string) => void;
  setContent: (content: string) => void;
  setSelectedOptions: (options: string[]) => void;
  setSubmitting: (submitting: boolean) => void;
  submittingRef: RefObject<boolean | null>;
}) {
  return async () => {
    if (askUser) {
      if (!onAnswer || submittingRef.current) {
        return;
      }
      if (
        askUser.kind === "choice" &&
        selectedOptions.length === 0 &&
        askNote.trim().length === 0
      ) {
        return;
      }
      const answer: AskUserAnswer =
        askUser.kind === "choice"
          ? { kind: "choice", note: askNote, options: selectedOptions }
          : { answer: askNote, kind: "open_ended" };
      submittingRef.current = true;
      setSubmitting(true);
      try {
        await onAnswer(askUser.callId, answer);
        setAskNote("");
        setSelectedOptions([]);
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
      return;
    }
    const submittedContent = contentRef.current;
    if (submittingRef.current || !submittedContent?.trim()) {
      return;
    }
    const submittedRevision = revisionRef.current ?? 0;
    submittingRef.current = true;
    setSubmitting(true);
    historyRef.current?.reset();
    contentRef.current = "";
    setContent("");
    try {
      await submitMessage({
        attachments: attachmentValues(submittedContent),
        clearPending: () => saverRef.current?.discardPending(),
        draftTarget,
        onSend,
        restore: () => {
          revisionRef.current = submittedRevision + 1;
          contentRef.current = submittedContent;
          setContent(submittedContent);
          saverRef.current?.schedule(submittedContent, revisionRef.current);
        },
        submittedContent,
        submittedRevision,
      });
      clearAttachments();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };
}
