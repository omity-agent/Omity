import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { events, queue, toolCancellations } from "../schema";
import type { Database } from "bun:sqlite";
import { sessionDatabase } from "../connection";
import { toolNotRunning } from "../../../errors";

export function requestToolCancellation(db: Database, sessionId: string, callId: string) {
  const orm = sessionDatabase(db),
    cancellable = orm
      .select({ kind: events.kind })
      .from(events)
      .innerJoin(queue, eq(queue.id, events.queueId))
      .where(
        and(
          eq(events.sessionId, sessionId),
          inArray(events.kind, ["tool_call_delta", "tool_started", "tool_finished"]),
          inArray(queue.status, ["running", "paused"]),
          or(
            eq(events.payload, callId),
            eq(sql`json_extract(${events.payload}, '$.callId')`, callId),
            eq(sql`json_extract(${events.payload}, '$.idDelta')`, callId),
          ),
        ),
      )
      .orderBy(desc(events.id))
      .get();
  if (cancellable?.kind === undefined || cancellable.kind === "tool_finished") {
    throw toolNotRunning(callId);
  }
  orm
    .insert(toolCancellations)
    .values({ callId, requestedAt: Date.now(), sessionId })
    .onConflictDoUpdate({
      set: { requestedAt: Date.now() },
      target: [toolCancellations.sessionId, toolCancellations.callId],
    })
    .run();
}
export function takeToolCancellation(db: Database, sessionId: string, callId: string) {
  return Boolean(
    sessionDatabase(db)
      .delete(toolCancellations)
      .where(and(eq(toolCancellations.sessionId, sessionId), eq(toolCancellations.callId, callId)))
      .returning({ callId: toolCancellations.callId })
      .get(),
  );
}
export function clearToolCancellations(db: Database, sessionId: string) {
  sessionDatabase(db)
    .delete(toolCancellations)
    .where(eq(toolCancellations.sessionId, sessionId))
    .run();
}
