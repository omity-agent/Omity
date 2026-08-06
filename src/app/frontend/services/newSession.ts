import { type Page, sessionPage } from "../route";
import { useCallback, useState } from "react";
import type { InitialSessionState } from "../../initialState";
import type { PendingAttachment } from "../../attachments/contract";
import type { QueryClient } from "@tanstack/react-query";
import { addSession } from "./queries";
import { createSession } from "./client";

export function resolveNewSessionWorkspace(sourceWorkspace: string | undefined, cwd: string) {
  return sourceWorkspace ?? cwd;
}
export function useNewSession({
  cwd,
  navigate,
  queryClient,
}: {
  cwd: string;
  navigate: (page: Page) => void;
  queryClient: QueryClient;
}) {
  const [workspace, setWorkspace] = useState<string>();
  const [profile, setProfile] = useState<string>();
  const open = useCallback(
    (sourceWorkspace?: string) => {
      setWorkspace(sourceWorkspace);
      setProfile(undefined);
      navigate({ kind: "new" });
    },
    [navigate],
  );
  const create = useCallback(
    async (initialState: InitialSessionState, attachments: PendingAttachment[]) => {
      const result = await createSession(
        resolveNewSessionWorkspace(workspace, cwd),
        profile,
        initialState,
        attachments,
      );
      addSession(queryClient, result.session);
      navigate(sessionPage(result.session.id));
    },
    [cwd, navigate, profile, queryClient, workspace],
  );
  return {
    create,
    open,
    profile,
    setProfile,
    setWorkspace,
    workspace,
  };
}
