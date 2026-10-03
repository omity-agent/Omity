import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type SessionInfo,
  bootstrap,
  loadPredictions,
  loadUserMessages,
  stateEvents,
} from "./client";
import { useEffect, useRef } from "react";
import { sessionAttentionStore } from "./events/attention";
import { subscribeStateEvents } from "./events/reception";
import { transcriptKey } from "./transcript/query";

type BootstrapData = Awaited<ReturnType<typeof bootstrap>>;
const bootstrapKey = ["bootstrap"] as const,
  userMessagesKey = ["user-messages"] as const,
  predictionKey = (sessionId: string) => ["predictions", sessionId] as const;
export function useUserMessages() {
  return useQuery({
    queryFn: ({ signal }) => loadUserMessages(signal),
    queryKey: userMessagesKey,
  });
}
export function usePredictions(sessionId: string | undefined, idle: boolean) {
  return useQuery({
    enabled: sessionId !== undefined && idle,
    queryFn: ({ signal }) => loadPredictions(sessionId!, signal),
    queryKey: predictionKey(sessionId ?? ""),
  });
}
export function useBootstrap() {
  const queryClient = useQueryClient(),
    attention = sessionAttentionStore(queryClient),
    streamedSessions = useRef<SessionInfo[] | undefined>(undefined),
    query = useQuery({
      queryFn: async ({ signal }) => {
        const data = await bootstrap(signal);
        return streamedSessions.current ? { ...data, sessions: streamedSessions.current } : data;
      },
      queryKey: bootstrapKey,
    });
  useEffect(
    () =>
      subscribeStateEvents(stateEvents(), {
        deleted(sessionId) {
          attention.remove(sessionId);
          if (streamedSessions.current) {
            streamedSessions.current = withoutSession(streamedSessions.current, sessionId);
          }
          updateCachedSessions(queryClient, (sessions) => withoutSession(sessions, sessionId));
          queryClient.removeQueries({ queryKey: transcriptKey(sessionId) });
          queryClient.removeQueries({ queryKey: predictionKey(sessionId) });
          refreshUserMessages(queryClient);
        },
        session(session) {
          attention.upsert(session);
          if (streamedSessions.current) {
            streamedSessions.current = upsertSessionList(streamedSessions.current, session);
          }
          updateCachedSessions(queryClient, (sessions) => upsertSessionList(sessions, session));
          void queryClient.invalidateQueries({ queryKey: predictionKey(session.id) });
          refreshUserMessages(queryClient);
        },
        sessions(sessions) {
          attention.replace(sessions);
          streamedSessions.current = sessions;
          updateCachedSessions(queryClient, () => sessions);
          refreshUserMessages(queryClient);
        },
      }),
    [attention, queryClient],
  );
  return query;
}
export function addSession(queryClient: QueryClient, session: SessionInfo) {
  sessionAttentionStore(queryClient).upsert(session);
  updateCachedSessions(queryClient, (sessions) => upsertSessionList(sessions, session));
  refreshUserMessages(queryClient);
}
export function removeSession(queryClient: QueryClient, sessionId: string) {
  sessionAttentionStore(queryClient).remove(sessionId);
  updateCachedSessions(queryClient, (sessions) => withoutSession(sessions, sessionId));
  queryClient.removeQueries({ queryKey: transcriptKey(sessionId) });
  queryClient.removeQueries({ queryKey: predictionKey(sessionId) });
  refreshUserMessages(queryClient);
}
function refreshUserMessages(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: userMessagesKey }, { cancelRefetch: false });
}
function updateCachedSessions(
  queryClient: QueryClient,
  update: (sessions: SessionInfo[]) => SessionInfo[],
) {
  queryClient.setQueryData<BootstrapData>(bootstrapKey, (current) =>
    current ? { ...current, sessions: update(current.sessions) } : current,
  );
}
function upsertSessionList(sessions: SessionInfo[], session: SessionInfo) {
  return [session, ...sessions.filter(({ id }) => id !== session.id)].toSorted(
    (left, right) => right.updatedAt - left.updatedAt || right.createdAt - left.createdAt,
  );
}
function withoutSession(sessions: SessionInfo[], sessionId: string) {
  return sessions.filter(({ id }) => id !== sessionId);
}
