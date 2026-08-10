import {
  type ComposerDraftTarget,
  flushComposerDraft,
  readComposerDraft,
} from "../../../services/composerDrafts";
import { reportError, reportPromiseErrors } from "../../../services/errors";
import { useEffect, useRef, useState } from "react";
import { Actions } from "./Actions";
import { AskUserPrompt } from "./AskUser/Prompt";
import type { ComposerProps } from "./props";
import { DraftSaver } from "../../../services/scheduling/draftSaver";
import { MarkdownEditor } from "../MarkdownEditor";
import { UserMessageHistory } from "./history";
import { composerFrame } from "./layout";
import { useComposerEvents } from "./hooks/events";
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
  const { t } = useTranslation(),
    [content, setContent] = useState(draft ?? ""),
    [loading, setLoading] = useState(true),
    [submitting, setSubmitting] = useState(false),
    answerState = useQuestionAnswerState(askUser?.callId),
    askNote = answerState.note,
    selectedOptions = answerState.options,
    contentRef = useRef(content),
    { attachmentValues, clearAttachments, handlePasteFiles } =
      usePendingAttachments(attachmentSettings),
    historyRef = useRef(new UserMessageHistory()),
    revisionRef = useRef(0),
    saverRef = useRef<DraftSaver | undefined>(undefined),
    submittingRef = useRef(false),
    sessionId = draftTarget.kind === "session" ? draftTarget.sessionId : undefined;
  useEffect(() => {
    let current = true;
    const target: ComposerDraftTarget = sessionId
        ? { kind: "session", sessionId }
        : { kind: "new" },
      load = async () => {
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
        : { kind: "new" },
      saver = new DraftSaver(target, draftSaveDelayMs, reportError);
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
        : { kind: "new" },
      flush = () => {
        flushComposerDraft(target, contentRef.current, revisionRef.current);
      };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
    };
  }, [sessionId]);
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
    }),
    { handleContentChange, handleFormSubmit, handleSubmit, pasteFiles, updateContent } =
      useComposerEvents({
        contentRef,
        handlePasteFiles,
        historyRef,
        revisionRef,
        saverRef,
        setContent,
        submit,
      }),
    navigateHistory = useHistoryNavigation(historyRef, contentRef, updateContent, userMessages),
    editorDisabled = disabled || loading || submitting,
    submitDisabled = askUser
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
