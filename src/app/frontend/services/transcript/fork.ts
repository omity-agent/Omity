import type { ForkPage, Page } from "../../route";
import { forkDraftTarget, forkSubmissionKey, usePendingFork } from "./pendingFork";
import type { ComposerDraftTarget } from "../composerDrafts";
import type { TimelineMessage } from "../../../timeline";
import { useSessionTranscript } from "./query";
import { useUserMessageSubmissions } from "./submissions";

type Navigate = (page: Page, replace?: boolean) => void;
export { forkDraftTarget } from "./pendingFork";
function chatDraftTarget(page: ForkPage | undefined, sessionId: string | undefined) {
  if (page) {
    return forkDraftTarget(page);
  }
  return sessionId ? ({ kind: "session", sessionId } as const) : ({ kind: "new" } as const);
}
export function previewFork(view: TimelineMessage[], beforeMessageId: number) {
  const index = view.findIndex(
    (message) => message.id === beforeMessageId && message.role === "user",
  );
  return {
    draft: index === -1 ? undefined : view[index]?.content,
    view: index === -1 ? [] : view.slice(0, index),
  };
}
export function useForkableTranscript({
  activeSessionId,
  navigate,
  page,
  snapshotThrottleMs,
  sourceSessionId,
}: {
  activeSessionId?: string;
  navigate: Navigate;
  page?: ForkPage;
  snapshotThrottleMs?: number;
  sourceSessionId?: string;
}) {
  const transcript = useSessionTranscript(sourceSessionId, snapshotThrottleMs),
    draftTarget: ComposerDraftTarget = chatDraftTarget(page, activeSessionId),
    submissionSessionId = page ? forkSubmissionKey(page) : activeSessionId,
    submissions = useUserMessageSubmissions(submissionSessionId, transcript),
    pendingPreview = page ? previewFork(submissions.view, page.beforeMessageId) : undefined,
    { busy, ...flow } = usePendingFork({ navigate, page, submit: submissions.send });
  return { busy, draftTarget, flow, pendingPreview, submissions, transcript };
}
