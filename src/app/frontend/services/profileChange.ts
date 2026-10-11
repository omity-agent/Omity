import { type SessionStatus, isRunningStatus } from "../../../types";
import type { QueryClient } from "@tanstack/react-query";
import type { SessionInfo } from "../../sessionState";
import { reportError } from "./errors";
import { setSessionProfile } from "./client";
import { updateSession } from "./queries";

export function createProfileChangeHandler(options: {
  activeSession?: SessionInfo;
  newSession: boolean;
  pendingFork: boolean;
  profileChangePending: boolean;
  queryClient: QueryClient;
  sessionStatus?: SessionStatus;
  setNewProfile: (profile?: string) => void;
  setProfileChangePending: (pending: boolean) => void;
}) {
  return async (profile?: string) => {
    if (options.newSession) {
      options.setNewProfile(profile);
      return;
    }
    if (
      !options.activeSession ||
      options.pendingFork ||
      options.profileChangePending ||
      isRunningStatus(options.sessionStatus)
    ) {
      return;
    }
    options.setProfileChangePending(true);
    try {
      const result = await setSessionProfile(options.activeSession.id, profile);
      updateSession(options.queryClient, result.session);
    } catch (error) {
      reportError(error);
    } finally {
      options.setProfileChangePending(false);
    }
  };
}
