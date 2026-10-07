import { activeRuns, inputs, runs } from "../../../schema/execution";
import { and, eq, inArray } from "drizzle-orm";
import { checkpoints, events, fileLinkUnits } from "../../../schema";
import type { Database } from "bun:sqlite";
import type { ErrorDetails } from "../../../../../failures/details";
import type { RunStatus } from "../../../../../types";
import { carryPendingInputs } from "./continuation";
import { localize } from "../../../../../i18n/server";
import { requireSessionRecord } from "../../session/metadata";
import { sessionDatabase } from "../../../sqlite/connection";

export function createRunRecord(db: Database, sessionId: string, status: RunStatus = "pending") {
  return sessionDatabase(db)
    .insert(runs)
    .values({ sessionId, status })
    .returning({ id: runs.id })
    .get().id;
}
export function runStatusRecord(db: Database, runId: number) {
  const run = sessionDatabase(db)
    .select({ status: runs.status })
    .from(runs)
    .where(eq(runs.id, runId))
    .get();
  if (!run) {
    throw new Error(
      localize("database:execution.runMissingForRead", {
        value0: runId.toString(),
      }),
    );
  }
  return run.status;
}
export function setRunStatusRecord(
  db: Database,
  runId: number,
  status: RunStatus,
  error?: ErrorDetails,
) {
  const orm = sessionDatabase(db),
    [run] = orm
      .update(runs)
      .set({
        error: error ?? (status === "paused" ? runs.error : null),
        status,
      })
      .where(eq(runs.id, runId))
      .returning({ sessionId: runs.sessionId })
      .all();
  if (!run) {
    throw new Error(
      localize("database:execution.runMissingForUpdate", {
        value0: runId.toString(),
      }),
    );
  }
  let discardedInputIds: number[] = [];
  if (status === "done" || status === "canceled") {
    orm.delete(checkpoints).where(eq(checkpoints.runId, runId)).run();
    carryPendingInputs(db, runId, run.sessionId);
    const ownedInputs = orm.select({ id: inputs.id }).from(inputs).where(eq(inputs.runId, runId));
    orm.delete(events).where(inArray(events.inputId, ownedInputs)).run();
    if (status === "canceled") {
      discardedInputIds = ownedInputs.all().map(({ id }) => id);
      orm.delete(fileLinkUnits).where(inArray(fileLinkUnits.inputId, ownedInputs)).run();
    }
  }
  return { discardedInputIds, sessionId: run.sessionId };
}
export function pauseRunRecord(
  db: Database,
  sessionId: string,
  runId: number,
  error?: ErrorDetails,
) {
  requireSessionRecord(db, sessionId);
  return sessionDatabase(db)
    .update(runs)
    .set({ error: error ?? runs.error, status: "paused" })
    .where(and(eq(runs.id, runId), eq(runs.sessionId, sessionId), activeRuns()))
    .run().changes;
}
