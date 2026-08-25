import {
  type ComposerDraftTarget,
  clearTemporaryComposerDraft,
  composerDraftKey,
  readComposerDraft,
} from "../composerDrafts";
import { type ForkPage, type Page, forkPage, sessionPage } from "../../route";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { addSession, removeSession } from "../queries";
import {
  deleteSession,
  loadComposerDraft,
  materializeFork,
  saveComposerDraft,
  setControl,
} from "../client";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { Control } from "../../../../types";
import type { OptimisticUser } from "./optimistic";
import type { PendingAttachment } from "../../../attachments/contract";

type Navigate = (page: Page, replace?: boolean) => void;
type SubmitMessage = (
  optimistic: OptimisticUser,
  draftRevision: number,
  attachments: PendingAttachment[],
) => Promise<void>;
type MaterializedSession = Awaited<ReturnType<typeof materializeFork>>["session"];
export function forkDraftTarget(page: ForkPage): ComposerDraftTarget {
  return {
    beforeMessageId: page.beforeMessageId,
    kind: "fork",
    sourceSessionId: page.sourceSessionId,
  };
}
export function forkSubmissionKey(page: ForkPage) {
  return composerDraftKey(forkDraftTarget(page));
}
export function usePendingFork({
  navigate,
  page,
  submit,
}: {
  navigate: Navigate;
  page?: ForkPage;
  submit: SubmitMessage;
}) {
  "use no memo";
  const queryClient = useQueryClient(),
    [busy, setBusy] = useState(false),
    activating = useRef(false),
    materializations = useRef(new Map<string, Promise<MaterializedSession>>()),
    navigateRef = useLatest(navigate),
    pageRef = useLatest(page),
    queryClientRef = useLatest(queryClient),
    activate = useCallback(
      async (action: (sessionId: string, pending: ForkPage) => Promise<void>) => {
        if (activating.current) {
          return;
        }
        const pending = pageRef.current;
        if (!pending) {
          throw new Error("没有等待创建的 Fork 会话");
        }
        activating.current = true;
        setBusy(true);
        try {
          const session = await materializePending(
            queryClientRef.current,
            materializations.current,
            pending,
          );
          await action(session.id, pending);
          materializations.current.delete(forkSubmissionKey(pending));
          clearTemporaryComposerDraft(forkDraftTarget(pending));
          if (sameForkPage(pageRef.current, pending)) {
            navigateRef.current(sessionPage(session.id), true);
          }
        } finally {
          activating.current = false;
          setBusy(false);
        }
      },
      // oxlint-disable-next-line react/memo-dependencies
      [navigateRef, pageRef, queryClientRef],
    ),
    begin = useCallback(
      (nextSourceSessionId: string, nextMessageId: number) => {
        if (!pageRef.current) {
          materializations.current.clear();
        }
        navigate(forkPage(nextSourceSessionId, nextMessageId), pageRef.current !== undefined);
      },
      [navigate, pageRef],
    ),
    control = useCallback(
      (value: Extract<Control, "running" | "step" | "pause">) =>
        activate(async (sessionId, pending) => {
          const draft = await readComposerDraft(forkDraftTarget(pending), "");
          await saveMaterializedDraft(sessionId, draft.content, draft.revision);
          await setControl(sessionId, value);
        }),
      [activate],
    ),
    discard = useCallback(async () => {
      const pending = pageRef.current;
      if (!pending) {
        return;
      }
      const key = forkSubmissionKey(pending),
        materialized = materializations.current.get(key);
      if (materialized) {
        const session = await materialized;
        await deleteSession(session.id);
        removeSession(queryClientRef.current, session.id);
      }
      materializations.current.delete(key);
      clearTemporaryComposerDraft(forkDraftTarget(pending));
      navigate(sessionPage(pending.sourceSessionId), true);
    }, [navigate, pageRef, queryClientRef]),
    send = useCallback(
      (optimistic: OptimisticUser, draftRevision: number, attachments: PendingAttachment[]) =>
        activate(async (sessionId) => {
          const persistedRevision = await saveMaterializedDraft(
            sessionId,
            optimistic.content,
            draftRevision,
          );
          await submit({ ...optimistic, sessionId }, persistedRevision, attachments);
        }),
      [activate, submit],
    );
  return { begin, busy, control, discard, send };
}
function useLatest<Value>(value: Value) {
  const reference = useRef(value);
  useLayoutEffect(() => {
    reference.current = value;
  }, [value]);
  return reference;
}
function materializePending(
  queryClient: QueryClient,
  materializations: Map<string, Promise<MaterializedSession>>,
  page: ForkPage,
) {
  const key = forkSubmissionKey(page),
    current = materializations.get(key);
  if (current) {
    return current;
  }
  const creation = createMaterializedFork(queryClient, materializations, key, page);
  materializations.set(key, creation);
  return creation;
}
async function createMaterializedFork(
  queryClient: QueryClient,
  materializations: Map<string, Promise<MaterializedSession>>,
  key: string,
  page: ForkPage,
) {
  try {
    const { session } = await materializeFork(page.sourceSessionId, page.beforeMessageId);
    addSession(queryClient, session);
    return session;
  } catch (error) {
    materializations.delete(key);
    throw error;
  }
}
function sameForkPage(left: ForkPage | undefined, right: ForkPage) {
  return (
    left?.sourceSessionId === right.sourceSessionId &&
    left.beforeMessageId === right.beforeMessageId
  );
}
async function saveMaterializedDraft(sessionId: string, content: string, minimumRevision: number) {
  const current = await loadComposerDraft(sessionId);
  if (current.revision >= Number.MAX_SAFE_INTEGER) {
    throw new Error(`Composer 草稿版本号溢出：${sessionId}`);
  }
  const revision = Math.max(current.revision + 1, minimumRevision);
  await saveComposerDraft(sessionId, content, revision);
  return revision;
}
