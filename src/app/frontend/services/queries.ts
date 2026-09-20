import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { type SessionInfo, bootstrap, stateEvents } from "./client";
import {
  readDeletedEvent,
  readSessionEvent,
  readSessionsEvent,
  readWarningEvent,
} from "./events/data";
import { reportBrowserWarning, reportSessionErrors, subscribeEvents } from "./events/delivery";
import { useEffect, useRef } from "react";
import { sessionAttentionStore } from "./events/attention";
import { transcriptKey } from "./transcript/query";

type BootstrapData = Awaited<ReturnType<typeof bootstrap>>;
export { transcriptKey, type TranscriptData } from "./transcript/query";
const bootstrapKey = ["bootstrap"] as const;
export function useBootstrap() {
  const queryClient = useQueryClient(),
    attention = sessionAttentionStore(queryClient),
    reportedErrors = useRef(new Set<string>()),
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
      subscribeEvents(stateEvents(), {
        deleted(event) {
          const sessionId = readDeletedEvent(event);
          attention.remove(sessionId);
          if (streamedSessions.current) {
            streamedSessions.current = withoutSession(streamedSessions.current, sessionId);
          }
          updateCachedSessions(queryClient, (sessions) => withoutSession(sessions, sessionId));
          queryClient.removeQueries({ queryKey: transcriptKey(sessionId) });
        },
        session(event) {
          const session = readSessionEvent(event);
          attention.upsert(session);
          if (streamedSessions.current) {
            streamedSessions.current = upsertSessionList(streamedSessions.current, session);
          }
          updateCachedSessions(queryClient, (sessions) => upsertSessionList(sessions, session));
        },
        sessions(event) {
          const sessions = readSessionsEvent(event);
          attention.replace(sessions);
          streamedSessions.current = sessions;
          updateCachedSessions(queryClient, () => sessions);
        },
        warning(event) {
          reportBrowserWarning(readWarningEvent(event));
        },
      }),
    [attention, queryClient],
  );
  useEffect(() => {
    if (!query.data) {
      return;
    }
    reportSessionErrors(query.data.sessions, reportedErrors.current);
  }, [query.data]);
  return query;
}
export function addSession(queryClient: QueryClient, session: SessionInfo) {
  sessionAttentionStore(queryClient).upsert(session);
  updateCachedSessions(queryClient, (sessions) => upsertSessionList(sessions, session));
}
export function removeSession(queryClient: QueryClient, sessionId: string) {
  sessionAttentionStore(queryClient).remove(sessionId);
  updateCachedSessions(queryClient, (sessions) => withoutSession(sessions, sessionId));
  queryClient.removeQueries({ queryKey: transcriptKey(sessionId) });
}
function updateCachedSessions(
  queryClient: QueryClient,
  update: (sessions: SessionInfo[]) => SessionInfo[],
) {
  queryClient.setQueryData<BootstrapData>(bootstrapKey, (current) =>
    current ? { ...current, sessions: update(current.sessions) } : current,
  );
}
export function upsertSessionList(sessions: SessionInfo[], session: SessionInfo) {
  return [session, ...sessions.filter(({ id }) => id !== session.id)].toSorted(
    (left, right) => right.updatedAt - left.updatedAt || right.createdAt - left.createdAt,
  );
}
function withoutSession(sessions: SessionInfo[], sessionId: string) {
  return sessions.filter(({ id }) => id !== sessionId);
}
