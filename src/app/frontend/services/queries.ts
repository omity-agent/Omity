import { type FrontendSettings, type SessionInfo, bootstrap, stateEvents } from "./client";
import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  readDeletedEvent,
  readSessionEvent,
  readSessionsEvent,
  readWarningEvent,
} from "./events/data";
import { reportBrowserWarning, reportSessionErrors } from "./events/reporting";
import { useEffect, useRef } from "react";
import type { AttachmentSettings } from "../../attachments/contract";
import { reportError } from "./errors";
import { sessionAttentionStore } from "./events/attention";
import { transcriptKey } from "./transcript/query";

export interface BootstrapData {
  attachments: AttachmentSettings;
  cwd: string;
  frontend: FrontendSettings;
  profiles: {
    available: string[];
  };
  sessions: SessionInfo[];
}
export { transcriptKey, useSessionTranscript, type TranscriptData } from "./transcript/query";
export const bootstrapKey = ["bootstrap"] as const;
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
  useEffect(() => {
    const events = stateEvents(),
      replace = (event: Event) => {
        try {
          const sessions = readSessionsEvent(event);
          attention.replace(sessions);
          streamedSessions.current = sessions;
          if (!replaceCachedSessions(queryClient, sessions)) {
            streamedSessions.current = sessions;
          }
        } catch (error) {
          reportError(error);
        }
      },
      upsert = (event: Event) => {
        try {
          const session = readSessionEvent(event);
          attention.upsert(session);
          if (streamedSessions.current) {
            streamedSessions.current = upsertSessionList(streamedSessions.current, session);
          }
          updateCachedSessions(queryClient, (sessions) => upsertSessionList(sessions, session));
        } catch (error) {
          reportError(error);
        }
      },
      remove = (event: Event) => {
        try {
          const sessionId = readDeletedEvent(event);
          attention.remove(sessionId);
          if (streamedSessions.current) {
            streamedSessions.current = withoutSession(streamedSessions.current, sessionId);
          }
          updateCachedSessions(queryClient, (sessions) => withoutSession(sessions, sessionId));
          queryClient.removeQueries({ queryKey: transcriptKey(sessionId) });
        } catch (error) {
          reportError(error);
        }
      },
      warning = (event: Event) => {
        try {
          reportBrowserWarning(readWarningEvent(event));
        } catch (error) {
          reportError(error);
        }
      };
    events.addEventListener("sessions", replace);
    events.addEventListener("session", upsert);
    events.addEventListener("deleted", remove);
    events.addEventListener("warning", warning);
    return () => {
      events.close();
    };
  }, [attention, queryClient]);
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
  queryClient.setQueryData<BootstrapData>(bootstrapKey, (current) =>
    current ? { ...current, sessions: upsertSessionList(current.sessions, session) } : current,
  );
}
export function removeSession(queryClient: QueryClient, sessionId: string) {
  sessionAttentionStore(queryClient).remove(sessionId);
  queryClient.setQueryData<BootstrapData>(bootstrapKey, (current) =>
    current
      ? {
          ...current,
          sessions: withoutSession(current.sessions, sessionId),
        }
      : current,
  );
  queryClient.removeQueries({ queryKey: transcriptKey(sessionId) });
}
function replaceCachedSessions(queryClient: QueryClient, sessions: SessionInfo[]) {
  let replaced = false;
  queryClient.setQueryData<BootstrapData>(bootstrapKey, (current) => {
    if (!current) {
      return current;
    }
    replaced = true;
    return { ...current, sessions };
  });
  return replaced;
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
export function withoutSession(sessions: SessionInfo[], sessionId: string) {
  return sessions.filter(({ id }) => id !== sessionId);
}
