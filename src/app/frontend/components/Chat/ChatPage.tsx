import type { AskUserAnswer, AskUserQuestion } from "./toolActions";
import type { AttachmentSettings, PendingAttachment } from "../../../attachments/contract";
import { type ComposerDraftTarget, composerDraftKey } from "../../services/composerDrafts";
import type { Control, SessionStatus } from "../../../../types";
import type { DisplayQueue, TimelineMessage } from "../../../timeline";
import { Composer } from "./Composer/index";
import { FileLinkProvider } from "../FileLink/context";
import type { FrontendSettings } from "../../services/client";
import type { InitialSessionState } from "../../../initialState";
import { NewSessionPage } from "../NewSession";
import type { OptimisticUser } from "../../services/transcript/optimistic";
import { Transcript } from "../Transcript";
import { css } from "styled-system/css";
import { deriveChatActionState } from "./actionState";
import { useMemo } from "react";
import { useReasoningTranslation } from "../../services/translation/useReasoningTranslation";
import { useTranslation } from "react-i18next";

const page = css({
    display: "grid",
    gridTemplateRows: "minmax(0, 1fr) auto",
    h: "full",
    maxW: { _largeCanvas: "chatCanvas" },
    minH: 0,
    minW: 0,
    mx: "auto",
    overflow: "hidden",
    w: "full",
  }),
  empty = css({
    color: "muted",
    display: "grid",
    h: "full",
    placeItems: "center",
  });
export function ChatPage({
  activeId,
  actionPending = false,
  allowFork = true,
  attachmentSettings,
  control,
  draft,
  draftSaveDelayMs,
  draftTarget,
  newSession,
  pausing,
  queue,
  recentWorkspaces,
  availableProfiles,
  selectedProfile,
  sessionStatus,
  translationSettings,
  view,
  workspace,
  onCreate,
  onCancelTool,
  onSend,
  askUser,
  onAnswer,
  onControl,
  onDelete,
  onFork,
  onPickWorkspace,
  onProfileChange,
  onWorkspaceChange,
}: {
  activeId?: string;
  actionPending?: boolean;
  allowFork?: boolean;
  attachmentSettings?: AttachmentSettings;
  control: Control;
  draft?: string;
  draftSaveDelayMs?: number;
  draftTarget: ComposerDraftTarget;
  newSession: boolean;
  pausing: boolean;
  queue: DisplayQueue[];
  recentWorkspaces: string[];
  availableProfiles: string[];
  selectedProfile?: string;
  sessionStatus?: SessionStatus;
  translationSettings?: FrontendSettings["reasoningTranslation"];
  view: TimelineMessage[];
  workspace?: string;
  onCreate: (state: InitialSessionState, attachments: PendingAttachment[]) => Promise<void>;
  onCancelTool: (toolCallId: string) => Promise<void>;
  onSend: (
    optimistic: OptimisticUser,
    draftRevision: number,
    attachments: PendingAttachment[],
  ) => Promise<void>;
  askUser: AskUserQuestion | null;
  onAnswer: (callId: string, answer: AskUserAnswer) => Promise<void>;
  onControl: (control: Extract<Control, "running" | "step" | "pause">) => Promise<void>;
  onDelete?: () => Promise<void>;
  onFork: (messageId: number) => Promise<void>;
  onPickWorkspace: () => Promise<string | null>;
  onProfileChange: (profile?: string) => void;
  onWorkspaceChange: (workspace: string) => void;
}) {
  const { t } = useTranslation(),
    actionState = deriveChatActionState({
      control,
      pausing,
      queue,
      sessionStatus,
    }),
    latestUsage = view.findLast((item) => item.usage !== undefined)?.usage ?? null,
    userMessages = useMemo(
      () => view.filter((item) => item.role === "user").map((item) => item.content),
      [view],
    ),
    liveTranslation = useReasoningTranslation(activeId ?? "", view, translationSettings);
  if (!activeId) {
    if (newSession) {
      return (
        <NewSessionPage
          attachmentSettings={attachmentSettings}
          draftSaveDelayMs={draftSaveDelayMs}
          pageClassName={page}
          recentWorkspaces={recentWorkspaces}
          availableProfiles={availableProfiles}
          selectedProfile={selectedProfile}
          workspace={workspace ?? ""}
          onCreate={onCreate}
          onPickWorkspace={onPickWorkspace}
          onProfileChange={onProfileChange}
          onWorkspaceChange={onWorkspaceChange}
        />
      );
    }
    return (
      <div className={page}>
        <div className={empty}>{t("empty")}</div>
      </div>
    );
  }
  return (
    <div className={page}>
      <FileLinkProvider sessionId={activeId}>
        {view.length === 0 ? (
          <div className={empty}>{t("noMessages")}</div>
        ) : (
          <Transcript
            allowFork={allowFork}
            forkDisabled={actionPending || actionState.sessionActionDisabled}
            key={activeId}
            liveTranslation={liveTranslation}
            messages={view}
            onFork={onFork}
            onCancelTool={onCancelTool}
          />
        )}
      </FileLinkProvider>
      <Composer
        attachmentSettings={attachmentSettings}
        askUser={askUser}
        controlDisabled={actionPending || actionState.controlDisabled}
        controlState={actionState.controlState}
        deleteDisabled={actionPending || actionState.sessionActionDisabled}
        disabled={!activeId || actionPending}
        draft={draft}
        draftSaveDelayMs={draftSaveDelayMs}
        draftTarget={draftTarget}
        key={composerDraftKey(draftTarget)}
        userMessages={userMessages}
        usage={latestUsage}
        stepAvailable={actionState.stepAvailable}
        onControl={onControl}
        onDelete={onDelete}
        onAnswer={onAnswer}
        onSend={onSend}
      />
    </div>
  );
}
