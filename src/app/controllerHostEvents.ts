import type { AppHostEvents, AppHosts } from "./hosts";
import { type SessionInfo, projectSession } from "./sessionState";
import type { AppEvents } from "./events";
import type { AskUserRuntime } from "../infrastructure/toolbox/runtime";
import type { BrowserWarning } from "../types";
import type { RegisteredSession } from "./registry";
import { displayStreamEvent } from "./timeline";

export function controllerHostEvents(
  events: AppEvents,
  sessionInfo: (sessionId: string) => SessionInfo,
  changed: (sessionId: string) => void,
): AppHostEvents {
  return {
    activity: (sessionId) => {
      events.notifySession(sessionInfo(sessionId));
    },
    changed,
    transcript: (sessionId, event) => {
      events.notifyTranscript(sessionId, displayStreamEvent(event));
    },
    wait: (sessionId, delayMs) => events.wait(sessionId, delayMs),
    warning: (sessionId, warning: BrowserWarning) => {
      events.notifyWarning({ ...warning, details: { ...warning.details, sessionId } });
    },
  };
}
export function controllerSessionInfo(
  session: RegisteredSession,
  hosts: AppHosts,
  askUser: AskUserRuntime,
) {
  return projectSession(
    session,
    hosts.activity(session.id),
    hosts.error(session.id),
    askUser.question(session.id),
  );
}
