import { and, eq, exists, gt, not, sql } from "drizzle-orm";
import { hostLeases, runs, sessions } from "../../schema";
import type { Database } from "bun:sqlite";
import type { SessionDefinition } from "../../session/sessionDefinition";
import { requireSessionRecord } from "./metadata";
import { sessionDatabase } from "../../sqlite/connection";
import { sessionProfileBusy } from "../../../../errors";

export function writeSessionConfigurationRecord(
  db: Database,
  sessionId: string,
  profiles: readonly string[],
  definition: SessionDefinition,
) {
  requireSessionRecord(db, sessionId);
  const orm = sessionDatabase(db),
    running = orm
      .select({ id: runs.id })
      .from(runs)
      .where(and(eq(runs.sessionId, sessionId), eq(runs.status, "running"))),
    leased = orm
      .select({ sessionId: hostLeases.sessionId })
      .from(hostLeases)
      .where(and(eq(hostLeases.sessionId, sessionId), gt(hostLeases.expiresAt, Date.now()))),
    updated = orm
      .update(sessions)
      .set({
        definition,
        profiles: [...profiles],
        updatedAt: sql`max(${sessions.updatedAt}, unixepoch())`,
      })
      .where(and(eq(sessions.id, sessionId), not(exists(running)), not(exists(leased))))
      .run();
  if (updated.changes !== 1) {
    throw sessionProfileBusy(sessionId);
  }
}
