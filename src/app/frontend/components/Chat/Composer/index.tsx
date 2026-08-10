import {
  type ComposerDraftTarget,
  flushComposerDraft,
  readComposerDraft,
} from "../../../services/composerDrafts";
import { type SubmitEvent, useCallback, useEffect, useRef, useState } from "react";
import { reportError, reportPromiseErrors } from "../../../services/errors";
import { Actions } from "./Actions";
import { AskUserPrompt } from "./AskUser/Prompt";
import type { ComposerProps } from "./props";
import { DraftSaver } from "../../../services/scheduling/draftSaver";
import { MarkdownEditor } from "../MarkdownEditor";
import { UserMessageHistory } from "./history";
import { composerFrame } from "./layout";
import { useComposerSubmit } from "./hooks/submission";
import { useHistoryNavigation } from "./hooks/history";
import { usePendingAttachments } from "./hooks/attachments";
import { useQuestionAnswerState } from "./AskUser/state";
import { useTranslation } from "react-i18next";

export function Composer({
  disabled,
  attachmentSettings,
  draft,
  draftSaveDelayMs,
  draftTarget,
  userMessages,
  controlDisabled = false,
  controlState,
  deleteDisabled = false,
  stepAvailable = false,
  usage,
  onControl,
  onDelete,
  onAnswer,
  onSend,
  askUser,
}: ComposerProps) {
  const { t } = useTranslation();
  const [content, setContent] = useState(draft ?? "");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const answerState = useQuestionAnswerState(askUser?.callId);
  const askNote = answerState.note;
  const selectedOptions = answerState.options;
  const contentRef = useRef(content);
  const { attachmentValues, clearAttachments, handlePasteFiles } =
    usePendingAttachments(attachmentSettings);
  const historyRef = useRef(new UserMessageHistory());
  const revisionRef = useRef(0);
  const saverRef = useRef<DraftSaver | undefined>(undefined);
  const submittingRef = useRef(false);
  const sessionId = draftTarget.kind === "session" ? draftTarget.sessionId : undefined;
  useEffect(() => {
    let current = true;
    const target: ComposerDraftTarget = sessionId
      ? { kind: "session", sessionId }
      : { kind: "new" };
    const load = async () => {
      const loaded = await readComposerDraft(target, draft ?? "");
      if (!current) {
        return;
      }
      revisionRef.current = loaded.revision;
      contentRef.current = loaded.content;
      historyRef.current.reset();
      setContent(loaded.content);
      setLoading(false);
    };
    reportPromiseErrors(load());
    return () => {
      current = false;
    };
  }, [draft, sessionId]);
  useEffect(() => {
    if (draftSaveDelayMs === undefined) {
      return undefined;
    }
    const target: ComposerDraftTarget = sessionId
      ? { kind: "session", sessionId }
      : { kind: "new" };
    const saver = new DraftSaver(target, draftSaveDelayMs, reportError);
    saverRef.current = saver;
    return () => {
      if (saverRef.current === saver) {
        saverRef.current = undefined;
      }
      reportPromiseErrors(saver.flush());
    };
  }, [draftSaveDelayMs, sessionId]);
  useEffect(() => {
    const target: ComposerDraftTarget = sessionId
      ? { kind: "session", sessionId }
      : { kind: "new" };
    const flush = () => {
      flushComposerDraft(target, contentRef.current, revisionRef.current);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
    };
  }, [sessionId]);
  const updateContent = useCallback((nextContent: string) => {
    if (nextContent === contentRef.current) {
      return;
    }
    contentRef.current = nextContent;
    setContent(nextContent);
    revisionRef.current += 1;
    saverRef.current?.schedule(nextContent, revisionRef.current);
  }, []);
  const navigateHistory = useHistoryNavigation(historyRef, contentRef, updateContent, userMessages);
  const submit = useComposerSubmit({
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
    setAskNote: answerState.handleNoteChange,
    setContent,
    setSelectedOptions: answerState.handleOptionsChange,
    setSubmitting,
    submittingRef,
  });
  const handleSubmit = useCallback(() => {
    reportPromiseErrors(submit());
  }, [submit]);
  const handleFormSubmit = useCallback(
    (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      handleSubmit();
    },
    [handleSubmit],
  );
  const handleContentChange = useCallback(
    (nextContent: string) => {
      if (nextContent === contentRef.current) {
        return;
      }
      historyRef.current.reset();
      updateContent(nextContent);
    },
    [updateContent],
  );
  const pasteFiles = useCallback(
    (files: File[]) => handlePasteFiles(files, contentRef.current),
    [handlePasteFiles],
  );
  const editorDisabled = disabled || loading || submitting;
  const submitDisabled = askUser
    ? editorDisabled ||
      (askUser.kind === "choice" && selectedOptions.length === 0 && askNote.trim().length === 0)
    : editorDisabled || !content.trim();
  return (
    <form className={composerFrame} onSubmit={handleFormSubmit}>
      {askUser ? (
        <AskUserPrompt
          note={askNote}
          onNoteChange={answerState.handleNoteChange}
          onOptionsChange={answerState.handleOptionsChange}
          onSubmit={handleSubmit}
          question={askUser}
          selectedOptions={selectedOptions}
        />
      ) : (
        <MarkdownEditor
          disabled={editorDisabled}
          onChange={handleContentChange}
          onHistoryNavigate={navigateHistory}
          onPasteFiles={attachmentSettings ? pasteFiles : undefined}
          onSubmit={handleSubmit}
          placeholder={t("messagePlaceholder")}
          value={content}
        />
      )}
      <Actions
        controlDisabled={controlDisabled}
        controlState={controlState}
        deleteDisabled={deleteDisabled}
        stepAvailable={stepAvailable}
        submitLabel={askUser ? t("answer") : t("send")}
        submitDisabled={submitDisabled}
        usage={usage}
        onControl={onControl}
        onDelete={onDelete}
      />
    </form>
  );
}
