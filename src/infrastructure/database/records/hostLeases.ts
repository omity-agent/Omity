import { and, eq, lte, or } from "drizzle-orm";
import type { Database } from "bun:sqlite";
import { hostLeases } from "../schema";
import { requireSessionRecord } from "./sessions";
import { sessionDatabase } from "../connection";

export interface HostLeaseClaim {
  sessionId: string;
  ownerId: string;
  now: number;
  ttlMs: number;
}
export interface HostLeaseRecord {
  sessionId: string;
  ownerId: string;
  expiresAt: number;
}
export function readHostLeaseRecord(db: Database, sessionId: string): HostLeaseRecord | null {
  requireSessionRecord(db, sessionId);
  return (
    sessionDatabase(db)
      .select()
      .from(hostLeases)
      .where(eq(hostLeases.sessionId, sessionId))
      .get() ?? null
  );
}
export function acquireHostLeaseRecord(db: Database, claim: HostLeaseClaim) {
  requireSessionRecord(db, claim.sessionId);
  return Boolean(
    sessionDatabase(db)
      .insert(hostLeases)
      .values({
        expiresAt: claim.now + claim.ttlMs,
        ownerId: claim.ownerId,
        sessionId: claim.sessionId,
      })
      .onConflictDoUpdate({
        set: { expiresAt: claim.now + claim.ttlMs, ownerId: claim.ownerId },
        setWhere: or(eq(hostLeases.ownerId, claim.ownerId), lte(hostLeases.expiresAt, claim.now)),
        target: hostLeases.sessionId,
      })
      .returning({ sessionId: hostLeases.sessionId })
      .get(),
  );
}
export function renewHostLeaseRecord(db: Database, claim: HostLeaseClaim) {
  return Boolean(
    sessionDatabase(db)
      .update(hostLeases)
      .set({ expiresAt: claim.now + claim.ttlMs })
      .where(and(eq(hostLeases.sessionId, claim.sessionId), eq(hostLeases.ownerId, claim.ownerId)))
      .returning({ sessionId: hostLeases.sessionId })
      .get(),
  );
}
export function releaseHostLeaseRecord(db: Database, sessionId: string, ownerId: string) {
  return Boolean(
    sessionDatabase(db)
      .delete(hostLeases)
      .where(and(eq(hostLeases.sessionId, sessionId), eq(hostLeases.ownerId, ownerId)))
      .returning({ sessionId: hostLeases.sessionId })
      .get(),
  );
}
