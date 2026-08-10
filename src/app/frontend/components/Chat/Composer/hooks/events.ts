import type { RefObject, SubmitEvent } from "react";
import type { DraftSaver } from "../../../../services/scheduling/draftSaver";
import type { UserMessageHistory } from "../history";
import { reportPromiseErrors } from "../../../../services/errors";

export function useComposerEvents({
  contentRef,
  handlePasteFiles,
  historyRef,
  revisionRef,
  saverRef,
  setContent,
  submit,
}: {
  contentRef: RefObject<string>;
  handlePasteFiles: (files: File[], content: string) => string | undefined;
  historyRef: RefObject<UserMessageHistory>;
  revisionRef: RefObject<number>;
  saverRef: RefObject<DraftSaver | undefined>;
  setContent: (content: string) => void;
  submit: () => Promise<void>;
}) {
  const updateContent = (nextContent: string) => {
      updateComposerContent(nextContent, contentRef, revisionRef, saverRef, setContent);
    },
    handleSubmit = () => {
      reportPromiseErrors(submit());
    },
    handleFormSubmit = (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      handleSubmit();
    },
    handleContentChange = (nextContent: string) => {
      if (nextContent === contentRef.current) {
        return;
      }
      historyRef.current.reset();
      updateContent(nextContent);
    },
    pasteFiles = (files: File[]) => handlePasteFiles(files, contentRef.current);
  return {
    handleContentChange,
    handleFormSubmit,
    handleSubmit,
    pasteFiles,
    updateContent,
  };
}
function updateComposerContent(
  nextContent: string,
  contentRef: RefObject<string>,
  revisionRef: RefObject<number>,
  saverRef: RefObject<DraftSaver | undefined>,
  setContent: (content: string) => void,
) {
  if (nextContent === contentRef.current) {
    return;
  }
  contentRef.current = nextContent;
  setContent(nextContent);
  revisionRef.current += 1;
  saverRef.current?.schedule(nextContent, revisionRef.current);
}
