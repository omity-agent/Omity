import { type ComponentProps, useCallback, useMemo, useState } from "react";
import { type SessionInfo, deleteSession, pickWorkspacePath, setControl } from "./services/client";
import { layout, main, sidebar } from "./design";
import {
  readPage,
  resolvePage,
  transcriptSessionId,
  usePageNavigation,
  usePageNavigator,
} from "./route";
import { removeSession, useBootstrap } from "./services/queries";
import { AccessGate } from "./components/Access/AccessGate";
import { ChatPage } from "./components/Chat/ChatPage";
import { Sidebar } from "./components/Sidebar";
import { cx } from "styled-system/css";
import { pauseRequestPending } from "./components/Chat/actionState";
import { recentWorkspaces } from "./services/recentWorkspaces";
import { useForkableTranscript } from "./services/transcript/fork";
import { useNewSession } from "./services/newSession";
import { useQueryClient } from "@tanstack/react-query";
import { useSessionAttention } from "./services/events/attention";
import { useSessionPresentation } from "./components/Sidebar/useSessionPresentation";
import { useSessionToolActions } from "./components/Chat/toolActions";

const emptySessions: SessionInfo[] = [],
  emptyProfiles: string[] = [],
  emptyQueue: [] = [];
type ChatPageProps = ComponentProps<typeof ChatPage>;
export function App() {
  return (
    <AccessGate>
      <AuthenticatedApp />
    </AccessGate>
  );
}
function AuthenticatedApp() {
  const queryClient = useQueryClient(),
    bootstrap = useBootstrap(),
    [page, setPage] = useState(readPage),
    [pausingSessionId, setPausingSessionId] = useState<string>(),
    [deletingSessionId, setDeletingSessionId] = useState<string>(),
    navigate = usePageNavigator(setPage),
    sessions = bootstrap.data?.sessions ?? emptySessions,
    cwd = bootstrap.data?.cwd ?? "",
    currentPage = resolvePage(page, sessions, bootstrap.data !== undefined),
    pendingFork = currentPage.kind === "fork" ? currentPage : undefined,
    activeSession =
      currentPage.kind === "session"
        ? sessions.find((session) => session.id === currentPage.id)
        : undefined,
    sourceSession = pendingFork
      ? sessions.find((session) => session.id === pendingFork.sourceSessionId)
      : activeSession,
    {
      busy: forkActionPending,
      draftTarget,
      flow: {
        begin: beginPendingFork,
        control: controlPendingFork,
        discard: discardPendingFork,
        send: sendPendingFork,
      },
      pendingPreview,
      submissions,
      transcript,
    } = useForkableTranscript({
      activeSessionId: activeSession?.id,
      navigate,
      page: pendingFork,
      snapshotThrottleMs: bootstrap.data?.frontend.transcriptSnapshotThrottleMs,
      sourceSessionId: transcriptSessionId(sourceSession?.id, deletingSessionId),
    }),
    {
      create: createNewSession,
      open: openNewSession,
      profile: newProfile,
      setProfile: setNewProfile,
      setWorkspace: setNewWorkspace,
      workspace: newWorkspace,
    } = useNewSession({
      cwd,
      navigate,
      queryClient,
      sourceWorkspace: sourceSession?.workspace,
    });
  usePageNavigation(page, currentPage, setPage);
  const pausing =
      !pendingFork && pauseRequestPending(pausingSessionId, activeSession?.id, transcript.queue),
    { activeSession: displayedActiveSession, sessions: displayedSessions } = useSessionPresentation(
      sessions,
      activeSession?.id,
      pausing,
    ),
    unreadSessionIds = useSessionAttention(queryClient, activeSession?.id),
    workspaces = useMemo(() => recentWorkspaces(sessions), [sessions]),
    selectSession = useCallback((id: string) => navigate({ id, kind: "session" }), [navigate]),
    toolActions = useSessionToolActions(activeSession),
    changeControl = useCallback<ChatPageProps["onControl"]>(
      async (control) => {
        if (pendingFork) {
          await controlPendingFork(control);
          return;
        }
        if (!activeSession) {
          return;
        }
        if (control === "pause") {
          setPausingSessionId(activeSession.id);
        }
        try {
          await setControl(activeSession.id, control);
        } catch (error) {
          if (control === "pause") {
            setPausingSessionId(undefined);
          }
          throw error;
        }
        if (control !== "pause") {
          setPausingSessionId(undefined);
        }
      },
      [activeSession, controlPendingFork, pendingFork, setPausingSessionId],
    ),
    deleteActiveSession = useCallback(async () => {
      if (pendingFork) {
        await discardPendingFork();
        return;
      }
      if (!activeSession) {
        return;
      }
      const sessionId = activeSession.id;
      setDeletingSessionId(sessionId);
      try {
        await deleteSession(sessionId);
        removeSession(queryClient, sessionId);
        navigate({ kind: "new" });
      } finally {
        setDeletingSessionId(undefined);
      }
    }, [activeSession, discardPendingFork, navigate, pendingFork, queryClient]),
    beginFork = useCallback<ChatPageProps["onFork"]>(
      async (messageId) => {
        const sourceSessionId = pendingFork?.sourceSessionId ?? activeSession?.id;
        if (!sourceSessionId) {
          return;
        }
        beginPendingFork(sourceSessionId, messageId);
      },
      [activeSession, beginPendingFork, pendingFork],
    ),
    sendSessionMessage = pendingFork ? sendPendingFork : submissions.send;
  return (
    <div className={cx("dark", layout)}>
      <aside className={sidebar}>
        <Sidebar
          activeId={activeSession?.id}
          showCreate={currentPage.kind !== "new"}
          sessions={displayedSessions}
          unreadIds={unreadSessionIds}
          onCreate={openNewSession}
          onSelect={selectSession}
        />
      </aside>
      <main className={main}>
        <ChatPage
          activeId={sourceSession?.id}
          actionPending={forkActionPending}
          allowFork={!pendingFork}
          attachmentSettings={bootstrap.data?.attachments}
          control={pendingFork ? "running" : transcript.control}
          draft={pendingPreview?.draft}
          draftSaveDelayMs={bootstrap.data?.frontend.draftSaveDelayMs}
          draftTarget={draftTarget}
          newSession={currentPage.kind === "new"}
          pausing={pausing}
          queue={pendingFork ? emptyQueue : transcript.queue}
          recentWorkspaces={workspaces}
          availableProfiles={bootstrap.data?.profiles.available ?? emptyProfiles}
          selectedProfile={newProfile}
          sessionStatus={pendingFork ? "paused" : displayedActiveSession?.status}
          translationSettings={bootstrap.data?.frontend.reasoningTranslation}
          view={pendingPreview?.view ?? submissions.view}
          workspace={newWorkspace ?? cwd}
          onCreate={createNewSession}
          onCancelTool={toolActions.handleCancel}
          askUser={activeSession?.askUser ?? null}
          onAnswer={toolActions.handleAnswer}
          onControl={changeControl}
          onDelete={deleteActiveSession}
          onFork={beginFork}
          onPickWorkspace={pickWorkspacePath}
          onProfileChange={setNewProfile}
          onSend={sendSessionMessage}
          onWorkspaceChange={setNewWorkspace}
        />
      </main>
    </div>
  );
}
