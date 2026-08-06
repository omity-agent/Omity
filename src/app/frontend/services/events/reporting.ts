import { errorFingerprint, summarizeError } from "../../../../failures/details";
import type { SessionInfo } from "../client";

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
