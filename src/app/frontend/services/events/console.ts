import type { BrowserWarning, SessionFailure, SessionInfo } from "../../../events/contracts";
import { localize } from "../../i18n";
import { summarizeError } from "../../../../failures/details";

export function restoreSessionConsole(sessions: SessionInfo[]) {
  for (const session of sessions) {
    if (session.error) {
      console.info(localize("frontend:session.restoredFailure"), {
        error: summarizeError(session.error),
        sessionId: session.id,
      });
    }
  }
}
export function reportSessionFailure(failure: SessionFailure) {
  console.error(localize("frontend:session.failure"), {
    error: summarizeError(failure.error),
    sessionId: failure.sessionId,
  });
}
export function reportBrowserWarning(warning: BrowserWarning) {
  console.warn(warning.message, {
    ...warning.details,
    error: summarizeError(warning.details.error),
  });
}
