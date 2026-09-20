import type { AppInstanceOwner } from "./instanceLock";
import { openStoredSession } from "../../storedSessions";
import { recoverHostSession } from "../../runtime/execution/recovery";

interface RecoverableSession {
  id: string;
}
export function recoverAppSessions(
  sessions: RecoverableSession[],
  abandonedOwner?: AppInstanceOwner,
) {
  return sessions.map((session) => {
    using db = openStoredSession(session.id);
    return {
      sessionId: session.id,
      ...recoverHostSession(
        db,
        session.id,
        abandonedOwner
          ? {
              instanceId: abandonedOwner.token,
              kind: "app",
              pid: abandonedOwner.pid,
            }
          : undefined,
      ),
    };
  });
}
export function hasLiveHostLease(sessionId: string) {
  using db = openStoredSession(sessionId);
  const lease = db.hostLease(sessionId);
  return lease !== null && lease.expiresAt > Date.now();
}
