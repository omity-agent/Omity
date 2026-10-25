import type { ErrorDetails } from "../failures/details";
import type { AskUserRequest } from "../infrastructure/toolbox/askUser";
import type { HostActivity, SessionStatus } from "../types";
import type { SessionInfo } from "./events/contracts";
import { pauseRequested, resolvePausePhase } from "./pauseState";
import type { RegisteredSession } from "./registry";

export type { SessionInfo } from "./events/contracts";
export function projectSession(
  session: RegisteredSession,
  activity: HostActivity,
  hostError: ErrorDetails | null,
  askUser: AskUserRequest | null = null,
): SessionInfo {
  return {
    askUser,
    createdAt: session.createdAt,
    id: session.id,
    title: session.title,
    updatedAt: session.updatedAt,
    workspace: session.workspace,
    ...resolveSessionState(session, activity, hostError),
  };
}
function resolveSessionState(
  session: Pick<RegisteredSession, "control" | "error" | "paused" | "profiles" | "queueRunning">,
  activity: HostActivity,
  hostError: ErrorDetails | null,
) {
  return {
    error: hostError ?? session.error,
    profile: session.profiles.at(-1),
    status: resolveSessionStatus(session, activity, hostError),
  };
}
function resolveSessionStatus(
  session: Pick<RegisteredSession, "control" | "paused" | "queueRunning" | "error">,
  activity: HostActivity,
  hostError: ErrorDetails | null,
): SessionStatus {
  if (hostError || session.error) {
    return "error";
  }
  const pausePhase = resolvePausePhase({
    paused: session.paused,
    requested: pauseRequested(session.control),
    running: session.queueRunning,
  });
  if (pausePhase !== "active") {
    return pausePhase;
  }
  return activity;
}
