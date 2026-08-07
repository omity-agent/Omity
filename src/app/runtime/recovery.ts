import { AgentDatabase } from "../../infrastructure/database/agentDatabase";
import type { AppInstanceOwner } from "./instanceLock";
import { recoverHostSession } from "../../runtime/execution/recovery";
import { resolveSessionPaths } from "../../infrastructure/configuration/sessionPaths";

interface RecoverableSession {
  id: string;
}
export function recoverAppSessions(
  sessions: RecoverableSession[],
  abandonedOwner?: AppInstanceOwner,
) {
  return sessions.map((session) => {
    const path = resolveSessionPaths(session.id).dbPath;
    const db = new AgentDatabase(path);
    try {
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
    } finally {
      db.close();
    }
  });
}
export function hasLiveHostLease(sessionId: string) {
  const path = resolveSessionPaths(sessionId).dbPath;
  const db = new AgentDatabase(path);
  try {
    const lease = db.hostLease(sessionId);
    return lease !== null && lease.expiresAt > Date.now();
  } finally {
    db.close();
  }
}
