import { type BaseMessage, ToolMessage } from "@langchain/core/messages";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { cancelledToolMessage, toolOutputSnapshot } from "../../../runtime/toolOutput";
import { events, queue, toolCancellations } from "../schema";
import { runTransaction, sessionDatabase } from "../connection";
import type { Database } from "bun:sqlite";
import { insertStreamEvent } from "./streamEvents";
import { toolNotRunning } from "../../../errors";
import { touchSessionRecord } from "./sessions";

export function requestToolCancellation(db: Database, sessionId: string, callId: string) {
  return runTransaction(db, () => {
    if (readToolCancellation(db, sessionId, callId) !== undefined) {
      return;
    }
    persistCancellation(db, sessionId, callId);
  });
}
function persistCancellation(db: Database, sessionId: string, callId: string) {
  const orm = sessionDatabase(db),
    cancellable = orm
      .select({
        kind: events.kind,
        messageId: events.messageId,
        partId: events.partId,
        queueId: events.queueId,
        status: queue.status,
      })
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
  orm.insert(toolCancellations).values({ callId, requestedAt: Date.now(), sessionId }).run();
  if (cancellable.kind === "tool_call_delta" && cancellable.status === "paused") {
    insertStreamEvent(db, sessionId, {
      kind: "tool_finished",
      messageId: cancellable.messageId,
      partId: cancellable.partId,
      queueId: cancellable.queueId,
      value: { callId, output: toolOutputSnapshot(cancelledToolMessage(callId, 0)) },
    });
  }
  touchSessionRecord(db, sessionId);
}
export function readToolCancellation(db: Database, sessionId: string, callId: string) {
  return sessionDatabase(db)
    .select({ requestedAt: toolCancellations.requestedAt })
    .from(toolCancellations)
    .where(and(eq(toolCancellations.sessionId, sessionId), eq(toolCancellations.callId, callId)))
    .get()?.requestedAt;
}
export function clearCompletedCancellations(
  db: Database,
  sessionId: string,
  messages: BaseMessage[],
) {
  const completed = messages
    .filter((message) => ToolMessage.isInstance(message))
    .map((message) => message.tool_call_id);
  if (completed.length === 0) {
    return;
  }
  sessionDatabase(db)
    .delete(toolCancellations)
    .where(
      and(eq(toolCancellations.sessionId, sessionId), inArray(toolCancellations.callId, completed)),
    )
    .run();
}
