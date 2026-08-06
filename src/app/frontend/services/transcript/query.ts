import {
  type TranscriptData,
  appendTranscriptEvents,
  emptyTranscriptData,
  reconcileTranscript,
} from "./cache";
import { contentEvents, loadTranscript } from "../client";
import { readContentSyncEvent, readTranscriptEvent } from "../events/data";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DisplayEvent } from "../../../timeline";
import { reportError } from "../errors";
import { useAsyncThrottler } from "@tanstack/react-pacer/async-throttler";
import { useBatcher } from "@tanstack/react-pacer/batcher";
import { useEffect } from "react";

export type { TranscriptData } from "./cache";
export const transcriptKey = (sessionId: string) => ["transcript", sessionId] as const;
const emptyTranscript = emptyTranscriptData();
export function useSessionTranscript(
  sessionId: string | undefined,
  refreshIntervalMs: number | undefined,
) {
  const queryClient = useQueryClient();
  const query = useQuery({
    enabled: sessionId !== undefined,
    queryFn: async ({ signal }) => {
      const id = requiredId(sessionId);
      const snapshot = await loadTranscript(id, signal);
      return reconcileTranscript(
        snapshot,
        queryClient.getQueryData<TranscriptData>(transcriptKey(id)),
      );
    },
    queryKey: transcriptKey(sessionId ?? ""),
  });
  const refresh = useAsyncThrottler(
    async (id: string) => {
      await refreshTranscript(queryClient, id);
    },
    {
      asyncRetryerOptions: {
        backoff: "exponential",
        baseWait: Math.max(refreshIntervalMs ?? 0, 250),
        maxAttempts: 4,
        maxWait: 2000,
      },
      onError: (error) => {
        reportError(error);
      },
      wait: refreshIntervalMs ?? 0,
    },
  );
  const deltas = useBatcher<DisplayEvent>(
    (batch) => {
      if (!sessionId) {
        return;
      }
      queryClient.setQueryData<TranscriptData>(transcriptKey(sessionId), (current) =>
        appendTranscriptEvents(current ?? emptyTranscriptData(), batch),
      );
    },
    { wait: refreshIntervalMs ?? 0 },
  );
  useEffect(() => {
    if (!sessionId || refreshIntervalMs === undefined) {
      return undefined;
    }
    const events = contentEvents(sessionId);
    const delta = (event: Event) => {
      try {
        const incoming = readTranscriptEvent(event);
        deltas.addItem(incoming);
        if (incoming.kind === "tool_finished") {
          void refresh.maybeExecute(sessionId);
        }
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
      deltas.clear();
      refresh.cancel();
      refresh.abort();
    };
  }, [deltas, refresh, refreshIntervalMs, sessionId]);
  return query.data ?? emptyTranscript;
}
async function refreshTranscript(
  queryClient: ReturnType<typeof useQueryClient>,
  sessionId: string,
) {
  const queryKey = transcriptKey(sessionId);
  const snapshot = await loadTranscript(sessionId);
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
