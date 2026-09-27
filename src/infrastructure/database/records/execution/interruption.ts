import {
  type HostLeaseClaim,
  type HostLeaseRecord,
  acquireHostLeaseRecord,
  readHostLeaseRecord,
  releaseHostLeaseRecord,
  renewHostLeaseRecord,
} from "./hostLeases";
import { activeRuns, inputs, runs } from "../../schema/execution";
import { and, eq, inArray, ne } from "drizzle-orm";
import { checkpoints, events } from "../../schema";
import {
  consumeStepControlRecord,
  readControlRecord,
  touchSessionRecord,
  writeControlRecord,
} from "../session/metadata";
import { runTransaction, sessionDatabase } from "../../sqlite/connection";
import type { Database } from "bun:sqlite";
import type { ErrorDetails } from "../../../../failures/details";
import { activeInputRows } from "./queue/workItems";
import { pauseRunRecord } from "./runs/mutations";
import { pruneUnreferencedMessages } from "../transcript/messages/history";

interface InterruptedSessionClaim {
  sessionId: string;
  now: number;
  confirmedDeadOwnerId?: string;
}
type InterruptedSessionRecovery =
  | { status: "blocked"; lease: HostLeaseRecord }
  | {
      status: "recovered";
      action: "paused" | "canceled" | "none";
      activeItems: number;
    };
function recoverInterruptedSessionRecord(
  db: Database,
  claim: InterruptedSessionClaim,
): InterruptedSessionRecovery {
  const lease = readHostLeaseRecord(db, claim.sessionId);
  if (lease && lease.expiresAt > claim.now && lease.ownerId !== claim.confirmedDeadOwnerId) {
    return { lease, status: "blocked" };
  }
  const active = activeInputRows(db, claim.sessionId),
    control = readControlRecord(db, claim.sessionId);
  let action: "paused" | "canceled" | "none" = "none";
  if (control === "cancel") {
    cancelActiveRuns(db, claim.sessionId, active);
    writeControlRecord(db, claim.sessionId, "running");
    action = active.length > 0 ? "canceled" : "none";
  } else if (active.length > 0) {
    const paused = sessionDatabase(db)
        .update(runs)
        .set({ status: "paused" })
        .where(and(eq(runs.sessionId, claim.sessionId), eq(runs.status, "running")))
        .run(),
      controlChanged = writeControlRecord(db, claim.sessionId, "pause");
    if (paused.changes > 0 && !controlChanged) {
      touchSessionRecord(db, claim.sessionId);
    }
    action = "paused";
  } else if (control === "pause_cancel") {
    writeControlRecord(db, claim.sessionId, "pause");
  }
  if (lease) {
    releaseHostLeaseRecord(db, claim.sessionId, lease.ownerId);
  }
  return { action, activeItems: active.length, status: "recovered" };
}
function cancelActiveRuns(
  db: Database,
  sessionId: string,
  active: ReturnType<typeof activeInputRows>,
) {
  if (active.length === 0) {
    return;
  }
  const orm = sessionDatabase(db),
    ownedRuns = orm
      .select({ id: runs.id })
      .from(runs)
      .where(and(eq(runs.sessionId, sessionId), activeRuns())),
    activeInputs = orm
      .select({ id: inputs.id })
      .from(inputs)
      .where(and(inArray(inputs.runId, ownedRuns), ne(inputs.delivery, "canceled")));
  orm.delete(events).where(inArray(events.inputId, activeInputs)).run();
  orm.delete(checkpoints).where(inArray(checkpoints.runId, ownedRuns)).run();
  orm
    .update(runs)
    .set({ error: null, status: "canceled" })
    .where(and(eq(runs.sessionId, sessionId), activeRuns()))
    .run();
  orm
    .update(inputs)
    .set({ delivery: "canceled" })
    .where(and(eq(inputs.sessionId, sessionId), eq(inputs.delivery, "pending")))
    .run();
  pruneUnreferencedMessages(db, sessionId);
}
export class RecoverableDatabase {
  constructor(readonly db: Database) {}
  hostLease(sessionId: string) {
    return readHostLeaseRecord(this.db, sessionId);
  }
  activeInputs(sessionId: string) {
    return activeInputRows(this.db, sessionId);
  }
  pauseRun(sessionId: string, runId: number, error?: ErrorDetails) {
    return runTransaction(this.db, () => {
      writeControlRecord(this.db, sessionId, "pause");
      return pauseRunRecord(this.db, sessionId, runId, error);
    });
  }
  pauseCompletedStep(sessionId: string, runId: number) {
    return runTransaction(this.db, () => {
      if (!consumeStepControlRecord(this.db, sessionId)) {
        return false;
      }
      pauseRunRecord(this.db, sessionId, runId);
      return true;
    });
  }
  recoverInterruptedSession(claim: InterruptedSessionClaim) {
    return runTransaction(this.db, () => recoverInterruptedSessionRecord(this.db, claim));
  }
  acquireHostLease(claim: HostLeaseClaim) {
    return acquireHostLeaseRecord(this.db, claim);
  }
  renewHostLease(claim: HostLeaseClaim) {
    return renewHostLeaseRecord(this.db, claim);
  }
  releaseHostLease(sessionId: string, ownerId: string) {
    return releaseHostLeaseRecord(this.db, sessionId, ownerId);
  }
}
