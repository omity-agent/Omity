import {
  type ComposerDraftTarget,
  flushComposerDraft,
  readComposerDraft,
  writeComposerDraft,
} from "../../../services/composerDrafts";
import { reportError, reportPromiseErrors } from "../../../services/errors";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Actions } from "./controls";
import { AskUserPrompt } from "./AskUser/Prompt";
import type { ComposerProps } from "./props";
import { DraftSaver } from "../../../services/scheduling/draftSaver";
import { MarkdownEditor } from "../MarkdownEditor";
import { UserInputPrediction } from "./prediction";
import { UserMessageHistory } from "./history";
import { composerFrame } from "./layout";
import { useComposerEvents } from "./hooks/events";
import { useComposerSubmit } from "./hooks/submission";
import { usePendingAttachments } from "./hooks/attachments";
import { useQuestionAnswerState } from "./AskUser/state";
import { useSuggestionNavigation } from "./hooks/suggestionNavigation";
import { useTranslation } from "react-i18next";

const emptyPredictions: readonly string[] = [];
export function Composer({
  disabled,
  attachmentSettings,
  cacheHitWarningRatio,
  draft,
  draftSaveDelayMs,
  draftTarget,
  userMessages,
  predictions = emptyPredictions,
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
  "use no memo";
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
    predictionRef = useRef(new UserInputPrediction()),
    revisionRef = useRef(0),
    saverRef = useRef<DraftSaver | undefined>(undefined),
    submittingRef = useRef(false),
    [stableDraftTarget] = useReducer((target: ComposerDraftTarget) => target, draftTarget);
  useEffect(() => {
    let current = true;
    const load = async () => {
      const loaded = await readComposerDraft(stableDraftTarget, draft ?? "");
      if (!current) {
        return;
      }
      revisionRef.current = loaded.revision;
      contentRef.current = loaded.content;
      historyRef.current.reset();
      predictionRef.current.reset();
      setContent(loaded.content);
      setLoading(false);
    };
    reportPromiseErrors(load());
    return () => {
      current = false;
    };
  }, [draft, stableDraftTarget]);
  useEffect(() => {
    if (draftSaveDelayMs === undefined) {
      return undefined;
    }
    const saver = new DraftSaver(stableDraftTarget, draftSaveDelayMs, reportError);
    saverRef.current = saver;
    return () => {
      if (saverRef.current === saver) {
        saverRef.current = undefined;
      }
      reportPromiseErrors(saver.flush());
    };
  }, [draftSaveDelayMs, stableDraftTarget]);
  useEffect(() => {
    const flush = () => {
      flushComposerDraft(stableDraftTarget, contentRef.current, revisionRef.current);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
    };
  }, [stableDraftTarget]);
  const handleControl = useCallback(
      async (control: Parameters<NonNullable<ComposerProps["onControl"]>>[0]) => {
        await saverRef.current?.flush();
        if (stableDraftTarget.kind !== "session") {
          await writeComposerDraft(stableDraftTarget, contentRef.current, revisionRef.current);
        }
        await onControl?.(control);
      },
      [onControl, stableDraftTarget],
    ),
    handleDelete = useCallback(async () => {
      saverRef.current?.discardPending();
      await onDelete?.();
    }, [onDelete]),
    submit = useComposerSubmit({
      askNote,
      askUser,
      attachmentValues,
      clearAttachments,
      contentRef,
      draftTarget: stableDraftTarget,
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
        predictionRef,
        revisionRef,
        saverRef,
        setContent,
        submit,
      }),
    { handleHistoryNavigate, handlePredictionNavigate } = useSuggestionNavigation({
      contentRef,
      historyRef,
      predictionRef,
      predictions,
      updateContent,
      userMessages,
    }),
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
          onHistoryNavigate={handleHistoryNavigate}
          onPredictionNavigate={handlePredictionNavigate}
          onPasteFiles={attachmentSettings ? pasteFiles : undefined}
          onSubmit={handleSubmit}
          placeholder={t("messagePlaceholder")}
          value={content}
        />
      )}
      <Actions
        cacheHitWarningRatio={cacheHitWarningRatio}
        controlDisabled={controlDisabled || loading || submitting}
        controlState={controlState}
        deleteDisabled={deleteDisabled}
        sessionId={stableDraftTarget.kind === "session" ? stableDraftTarget.sessionId : undefined}
        stepAvailable={stepAvailable}
        submitLabel={askUser ? t("answer") : t("send")}
        submitDisabled={submitDisabled}
        usage={usage}
        onControl={onControl ? handleControl : undefined}
        onDelete={onDelete ? handleDelete : undefined}
      />
    </form>
  );
}
