import { type ComponentProps, useCallback, useMemo, useState } from "react";
import { type Page, readPage, resolvePage, usePageNavigation, writePage } from "./route";
import {
  type SessionInfo,
  deleteSession,
  forkSession,
  pickWorkspacePath,
  sendMessage,
  setControl,
} from "./services/client";
import {
  addOptimisticUser,
  confirmOptimisticUser,
  removeOptimisticUser,
} from "./services/transcript/optimistic";
import { addSession, removeSession, useBootstrap, useSessionTranscript } from "./services/queries";
import { layout, main, sidebar } from "./design";
import { AccessGate } from "./components/Access/AccessGate";
import { ChatPage } from "./components/Chat/ChatPage";
import { Sidebar } from "./components/Sidebar";
import { cx } from "styled-system/css";
import { pauseRequestPending } from "./components/Chat/actionState";
import { recentWorkspaces } from "./services/recentWorkspaces";
import { useNewSession } from "./services/newSession";
import { useQueryClient } from "@tanstack/react-query";
import { useSessionAttention } from "./services/events/attention";
import { useSessionPresentation } from "./components/Sidebar/useSessionPresentation";
import { useSessionToolActions } from "./components/Chat/toolActions";

const emptySessions: SessionInfo[] = [];
const emptyProfiles: string[] = [];
type ChatPageProps = ComponentProps<typeof ChatPage>;
export function App() {
  return (
    <AccessGate>
      <AuthenticatedApp />
    </AccessGate>
  );
}
function AuthenticatedApp() {
  const queryClient = useQueryClient();
  const bootstrap = useBootstrap();
  const [page, setPage] = useState(readPage);
  const [pausingSessionId, setPausingSessionId] = useState<string>();
  const sessions = bootstrap.data?.sessions ?? emptySessions;
  const cwd = bootstrap.data?.cwd ?? "";
  const currentPage = resolvePage(page, sessions, bootstrap.data !== undefined);
  const activeSession =
    currentPage.kind === "session"
      ? sessions.find((session) => session.id === currentPage.id)
      : undefined;
  const transcript = useSessionTranscript(
    activeSession?.id,
    bootstrap.data?.frontend.transcriptRefreshIntervalMs,
  );
  const navigate = useCallback((nextPage: Page, replace = false) => {
    writePage(nextPage, replace);
    setPage(nextPage);
  }, []);
  const {
    create: createNewSession,
    open: openNewSessionFrom,
    profile: newProfile,
    setProfile: setNewProfile,
    setWorkspace: setNewWorkspace,
    workspace: newWorkspace,
  } = useNewSession({
    cwd,
    navigate,
    queryClient,
  });
  const openNewSession = useCallback(() => {
    openNewSessionFrom(activeSession?.workspace);
  }, [activeSession?.workspace, openNewSessionFrom]);
  usePageNavigation(page, currentPage, setPage);
  const pausing = pauseRequestPending(pausingSessionId, activeSession?.id, transcript.queue);
  const { activeSession: displayedActiveSession, sessions: displayedSessions } =
    useSessionPresentation(sessions, activeSession?.id, pausing);
  const unreadSessionIds = useSessionAttention(queryClient, activeSession?.id);
  const workspaces = useMemo(() => recentWorkspaces(sessions), [sessions]);
  const selectSession = useCallback(
    (id: string) => {
      navigate({ id, kind: "session" });
    },
    [navigate],
  );
  const toolActions = useSessionToolActions(activeSession);
  const changeControl = useCallback<ChatPageProps["onControl"]>(
    async (control) => {
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
    [activeSession],
  );
  const deleteActiveSession = useCallback(async () => {
    if (!activeSession) {
      return;
    }
    await deleteSession(activeSession.id);
    removeSession(queryClient, activeSession.id);
    navigate({ kind: "new" });
  }, [activeSession, navigate, queryClient]);
  const forkActiveSession = useCallback<ChatPageProps["onFork"]>(
    async (messageId) => {
      if (!activeSession) {
        return;
      }
      const { session } = await forkSession(activeSession.id, messageId);
      addSession(queryClient, session);
      setPausingSessionId(undefined);
      navigate({ id: session.id, kind: "session" });
    },
    [activeSession, navigate, queryClient],
  );
  const sendSessionMessage = useCallback<ChatPageProps["onSend"]>(
    async (content, draftRevision, attachments) => {
      if (!activeSession) {
        return;
      }
      const optimisticKey = addOptimisticUser(queryClient, activeSession.id, content);
      try {
        const { content: sentContent, queueId } = await sendMessage(
          activeSession.id,
          content,
          draftRevision,
          attachments,
        );
        confirmOptimisticUser(queryClient, activeSession.id, optimisticKey, queueId, sentContent);
      } catch (error) {
        removeOptimisticUser(queryClient, activeSession.id, optimisticKey);
        throw error;
      }
    },
    [activeSession, queryClient],
  );
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
          activeId={activeSession?.id}
          attachmentSettings={bootstrap.data?.attachments}
          draftSaveDelayMs={bootstrap.data?.frontend.draftSaveDelayMs}
          newSession={currentPage.kind === "new"}
          pausing={pausing}
          control={transcript.control}
          queue={transcript.queue}
          recentWorkspaces={workspaces}
          availableProfiles={bootstrap.data?.profiles.available ?? emptyProfiles}
          selectedProfile={newProfile}
          sessionStatus={displayedActiveSession?.status}
          view={transcript.view}
          workspace={newWorkspace ?? cwd}
          onCreate={createNewSession}
          onCancelTool={toolActions.handleCancel}
          askUser={activeSession?.askUser ?? null}
          onAnswer={toolActions.handleAnswer}
          onControl={changeControl}
          onDelete={deleteActiveSession}
          onFork={forkActiveSession}
          onPickWorkspace={pickWorkspacePath}
          onProfileChange={setNewProfile}
          onSend={sendSessionMessage}
          onWorkspaceChange={setNewWorkspace}
        />
      </main>
    </div>
  );
}
