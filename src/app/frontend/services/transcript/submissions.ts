import { type OptimisticUser, optimisticTimelineMessage } from "./optimistic";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { type TranscriptData, rebuildTranscript } from "./cache";
import { useEffect, useState } from "react";
import type { PendingAttachment } from "../../../attachments/contract";
import { sendMessage } from "../client";
import { transcriptKey } from "./query";

interface StagedUser extends OptimisticUser {
  accepted?: true;
}
export function useUserMessageSubmissions(
  sessionId: string | undefined,
  transcript: TranscriptData,
) {
  const queryClient = useQueryClient(),
    [staged, setStaged] = useState<StagedUser[]>([]),
    acknowledged = new Set(
      transcript.queue.flatMap(({ submissionId }) => (submissionId ? [submissionId] : [])),
    ),
    view = [
      ...transcript.view,
      ...staged
        .filter(
          (user) =>
            user.sessionId === sessionId &&
            (!user.accepted || !acknowledged.has(user.submissionId)),
        )
        .map(optimisticTimelineMessage),
    ];
  useEffect(() => {
    const acknowledgedIds = new Set(
        transcript.queue.flatMap(({ submissionId }) => (submissionId ? [submissionId] : [])),
      ),
      frame = requestAnimationFrame(() => {
        setStaged((current) => {
          const next = current.filter(
            (user) =>
              user.sessionId !== sessionId ||
              !user.accepted ||
              !acknowledgedIds.has(user.submissionId),
          );
          return next.length === current.length ? current : next;
        });
      });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [sessionId, transcript.queue]);
  const send = async (
    optimistic: OptimisticUser,
    draftRevision: number,
    attachments: PendingAttachment[],
  ) => {
    setStaged((current) => [...current, optimistic]);
    try {
      const { content, queueId } = await sendMessage(
        optimistic.sessionId,
        optimistic.content,
        draftRevision,
        optimistic.submissionId,
        attachments,
      );
      setStaged((current) =>
        current.map((user) => (user.key === optimistic.key ? { ...user, accepted: true } : user)),
      );
      acknowledgeUser(queryClient, optimistic.sessionId, optimistic.submissionId, queueId, content);
    } catch (error) {
      setStaged((current) => current.filter(({ key }) => key !== optimistic.key));
      throw error;
    }
  };
  return { send, view };
}
function acknowledgeUser(
  queryClient: QueryClient,
  sessionId: string,
  submissionId: string,
  queueId: number,
  content: string,
) {
  queryClient.setQueryData<TranscriptData>(transcriptKey(sessionId), (current) => {
    if (!current || current.queue.some(({ id }) => id === queueId)) {
      return current;
    }
    return rebuildTranscript(current, {
      queue: [
        ...current.queue,
        {
          content,
          error: null,
          id: queueId,
          status: "pending",
          submissionId,
          userMessageId: null,
        },
      ],
    });
  });
}
