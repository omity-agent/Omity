import type { BrowserWarning, SessionFailure, SessionInfo } from "../../../events/contracts";
import { summarizeError } from "../../../../failures/details";
import { t } from "i18next";

export function restoreSessionConsole(sessions: SessionInfo[]) {
  for (const session of sessions) {
    if (session.error) {
      console.info(t("diagnostics:restoredSessionFailure"), {
        error: summarizeError(session.error),
        sessionId: session.id,
      });
    }
  }
}
export function reportSessionFailure(failure: SessionFailure) {
  console.error(t("diagnostics:sessionFailure"), {
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
