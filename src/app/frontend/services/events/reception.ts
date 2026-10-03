import {
  readDeletedEvent,
  readFailureEvent,
  readRestorationEvent,
  readSessionEvent,
  readSessionsEvent,
  readWarningEvent,
} from "./data";
import { reportBrowserWarning, reportSessionFailure, restoreSessionConsole } from "./console";
import type { SessionInfo } from "../../../events/contracts";
import { subscribeEvents } from "./subscription";

export function subscribeStateEvents(
  source: Parameters<typeof subscribeEvents>[0],
  handlers: {
    deleted: (sessionId: string) => void;
    session: (session: SessionInfo) => void;
    sessions: (sessions: SessionInfo[]) => void;
  },
) {
  return subscribeEvents(source, {
    deleted: (event) => handlers.deleted(readDeletedEvent(event)),
    failure: (event) => reportSessionFailure(readFailureEvent(event)),
    restore(event) {
      const sessions = readRestorationEvent(event);
      handlers.sessions(sessions);
      restoreSessionConsole(sessions);
    },
    session: (event) => handlers.session(readSessionEvent(event)),
    sessions: (event) => handlers.sessions(readSessionsEvent(event)),
    warning: (event) => reportBrowserWarning(readWarningEvent(event)),
  });
}
