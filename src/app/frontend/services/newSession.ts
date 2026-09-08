import { type Page, sessionPage } from "../route";
import { useCallback, useState } from "react";
import type { InitialSessionState } from "../../initialState";
import type { PendingAttachment } from "../../attachments/contract";
import type { QueryClient } from "@tanstack/react-query";
import { addSession } from "./queries";
import { createSession } from "./client";

function resolveNewSessionWorkspace(sourceWorkspace: string | undefined, cwd: string) {
  return sourceWorkspace ?? cwd;
}
export function useNewSession({
  cwd,
  navigate,
  queryClient,
  sourceWorkspace,
}: {
  cwd: string;
  navigate: (page: Page) => void;
  queryClient: QueryClient;
  sourceWorkspace?: string;
}) {
  const [workspace, setWorkspace] = useState<string>(),
    [profile, setProfile] = useState<string>(),
    open = useCallback(() => {
      setWorkspace(sourceWorkspace);
      setProfile(undefined);
      navigate({ kind: "new" });
    }, [navigate, setProfile, setWorkspace, sourceWorkspace]),
    create = useCallback(
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
