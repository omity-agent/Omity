import { errorFingerprint, summarizeError } from "../../../../failures/details";
import type { BrowserWarning } from "../../../../types";
import type { SessionInfo } from "../client";
import { reportError } from "../errors";

export function subscribeEvents(
  source: EventTarget & { close: () => void },
  handlers: Record<string, (event: Event) => void>,
) {
  const controller = new AbortController();
  for (const [name, handle] of Object.entries(handlers)) {
    source.addEventListener(
      name,
      (event) => {
        try {
          handle(event);
        } catch (error) {
          reportError(error);
        }
      },
      { signal: controller.signal },
    );
  }
  return () => {
    controller.abort();
    source.close();
  };
}
export function reportSessionErrors(sessions: SessionInfo[], reported: Set<string>) {
  const current = new Set<string>();
  for (const session of sessions) {
    if (session.error) {
      const identity = `${session.id}:${errorFingerprint(session.error)}`;
      current.add(identity);
      if (!reported.has(identity)) {
        reported.add(identity);
        console.error("会话运行失败", {
          error: summarizeError(session.error),
          sessionId: session.id,
        });
      }
    }
  }
  for (const identity of reported) {
    if (!current.has(identity)) {
      reported.delete(identity);
    }
  }
}
export function reportBrowserWarning(warning: BrowserWarning) {
  console.warn(warning.message, warning.details);
}
