import { type AppHostEvents, AppHosts } from "./hosts";
import type { BrowserWarning, Settings } from "../types";
import { type SessionInfo, projectSession } from "./sessionState";
import type { AppEvents } from "./events";
import type { AskUserRuntime } from "../infrastructure/toolbox/runtime";
import type { ProcessOwner } from "../infrastructure/process/ownership";
import type { RegisteredSession } from "./registry";
import type { SettingsContext } from "../infrastructure/configuration/settings/context";
import { createAppMcp } from "./runtime/toolResources";

function controllerHostEvents(
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
      events.notifyTranscript(sessionId, event);
    },
    wait: (sessionId, delayMs) => events.wait(sessionId, delayMs),
    warning: (sessionId, warning: BrowserWarning) => {
      events.notifyWarning({ ...warning, details: { ...warning.details, sessionId } });
    },
  };
}
export function createControllerHosts(options: {
  askUser: AskUserRuntime;
  changed: (sessionId: string) => void;
  context: SettingsContext;
  events: AppEvents;
  owner: ProcessOwner;
  root: string;
  sessionInfo: (sessionId: string) => SessionInfo;
  settings: Settings;
}) {
  const { askUser, changed, context, events, owner, root, sessionInfo, settings } = options;
  return new AppHosts(
    root,
    controllerHostEvents(events, sessionInfo, changed),
    owner,
    settings.host.shutdownTimeoutMs,
    createAppMcp(root, settings.logging.level, context, askUser),
    context,
  );
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
