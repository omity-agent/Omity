import {
  type TranscriptData,
  appendTranscriptEvents,
  emptyTranscriptData,
  reconcileTranscript,
} from "./cache";
import { contentEvents, loadTranscript } from "../client";
import { readContentSyncEvent, readTranscriptEvent } from "../events/data";
import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DisplayEvent } from "../../../timeline";
import { FrameBatcher } from "../scheduling/frameBatcher";
import { reportError } from "../errors";
import { useAsyncThrottler } from "@tanstack/react-pacer/async-throttler";

export type { TranscriptData } from "./cache";
export const transcriptKey = (sessionId: string) => ["transcript", sessionId] as const;
const emptyTranscript = emptyTranscriptData();
export function useSessionTranscript(
  sessionId: string | undefined,
  snapshotThrottleMs: number | undefined,
) {
  const queryClient = useQueryClient(),
    query = useQuery({
      enabled: sessionId !== undefined,
      queryFn: async ({ signal }) => {
        const id = requiredId(sessionId),
          snapshot = await loadTranscript(id, signal);
        return reconcileTranscript(
          snapshot,
          queryClient.getQueryData<TranscriptData>(transcriptKey(id)),
        );
      },
      queryKey: transcriptKey(sessionId ?? ""),
    }),
    refresh = useAsyncThrottler(
      async (id: string) => {
        await refreshTranscript(queryClient, id);
      },
      {
        asyncRetryerOptions: {
          backoff: "exponential",
          baseWait: Math.max(snapshotThrottleMs ?? 0, 250),
          maxAttempts: 4,
          maxWait: 2000,
        },
        onError: (error) => {
          reportError(error);
        },
        wait: snapshotThrottleMs ?? 0,
      },
    ),
    deltas = useMemo(
      () =>
        new FrameBatcher<DisplayEvent>((batch) => {
          if (!sessionId) {
            return;
          }
          queryClient.setQueryData<TranscriptData>(transcriptKey(sessionId), (current) =>
            appendTranscriptEvents(current ?? emptyTranscriptData(), batch),
          );
        }),
      [queryClient, sessionId],
    );
  useEffect(() => {
    if (!sessionId || snapshotThrottleMs === undefined) {
      return undefined;
    }
    const events = contentEvents(sessionId),
      delta = (event: Event) => {
        try {
          const incoming = readTranscriptEvent(event);
          deltas.add(incoming);
        } catch (error) {
          reportError(error);
        }
      };
    events.addEventListener("sync", (event) => {
      try {
        readContentSyncEvent(event);
        void refresh.maybeExecute(sessionId);
      } catch (error) {
        reportError(error);
      }
    });
    events.addEventListener("delta", delta);
    return () => {
      events.close();
      deltas.cancel();
      refresh.cancel();
      refresh.abort();
    };
  }, [deltas, refresh, sessionId, snapshotThrottleMs]);
  return query.data ?? emptyTranscript;
}
async function refreshTranscript(
  queryClient: ReturnType<typeof useQueryClient>,
  sessionId: string,
) {
  const queryKey = transcriptKey(sessionId),
    snapshot = await loadTranscript(sessionId);
  queryClient.setQueryData<TranscriptData>(queryKey, (current) =>
    reconcileTranscript(snapshot, current),
  );
}
function requiredId(sessionId: string | undefined) {
  if (!sessionId) {
    throw new Error("Transcript 查询缺少 sessionId");
  }
  return sessionId;
}
