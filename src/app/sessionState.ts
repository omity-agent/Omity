import type { HostActivity, SessionStatus } from "../types";
import { pauseRequested, resolvePausePhase } from "./pauseState";
import type { AskUserRequest } from "../infrastructure/toolbox/askUser";
import type { ErrorDetails } from "../failures/details";
import type { RegisteredSession } from "./registry";
import type { SessionInfo } from "./events/contracts";

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
export function resolveSessionState(
  session: Pick<RegisteredSession, "control" | "paused" | "queueRunning" | "error">,
  activity: HostActivity,
  hostError: ErrorDetails | null,
) {
  return {
    error: hostError ?? session.error,
    status: resolveSessionStatus(session, activity, hostError),
  };
}
export function resolveSessionStatus(
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
