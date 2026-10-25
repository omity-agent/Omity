import type { Database } from "bun:sqlite";

import { and, eq, exists, inArray, not } from "drizzle-orm";

import { controlNotReady } from "../../../../errors";
import { localize } from "../../../../i18n/server";
import { runs, sessions } from "../../schema";
import { sessionDatabase } from "../../sqlite/connection";
import { readControlRecord, requireSessionRecord, reviseSessionRecord } from "../session/metadata";

export function requestStepControlRecord(db: Database, sessionId: string) {
  requireSessionRecord(db, sessionId);
  const orm = sessionDatabase(db),
    run = (status: "paused" | "running") =>
      orm
        .select({ id: runs.id })
        .from(runs)
        .where(and(eq(runs.sessionId, sessionId), eq(runs.status, status))),
    steppable = and(exists(run("paused")), not(exists(run("running")))),
    changed = reviseSessionRecord(
      db,
      sessionId,
      "step",
      and(inArray(sessions.control, ["running", "pause"]), steppable),
    );
  if (changed === 1) {
    return;
  }
  const control = readControlRecord(db, sessionId),
    ready = Boolean(
      orm
        .select({ id: sessions.id })
        .from(sessions)
        .where(and(eq(sessions.id, sessionId), steppable))
        .get(),
    );
  if (control === "step" && ready) {
    return;
  }
  if ((control === "running" || control === "pause") && ready) {
    throw new Error(
      localize("database:execution.controlRevisionExhausted", {
        value0: sessionId,
      }),
    );
  }
  throw controlNotReady("step");
}
