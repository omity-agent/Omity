import type { QueueItem, QueueStatus } from "../../../../types";
import { and, eq, sql } from "drizzle-orm";
import { cachedQuery, sessionDatabase } from "../../connection";
import type { Database } from "bun:sqlite";
import { DomainError } from "../../../../errors";
import type { ErrorDetails } from "../../../../failures/details";
import { insertUserMessage } from "../messages/history";
import { queue } from "../../schema";
import { requireSessionRecord } from "../sessions";

export function appendUserQueue(
  db: Database,
  sessionId: string,
  content: string,
  submissionId?: string,
) {
  const activeRun = cachedQuery<{ root_id: number }>(
    db,
    `SELECT root_id FROM queue
     WHERE session_id = ? AND root_id IS NOT NULL
       AND status IN ('pending', 'running', 'paused')
     ORDER BY root_id LIMIT 1`,
  ).get(sessionId);
  if (activeRun) {
    return appendToRun(db, sessionId, activeRun.root_id, content, submissionId);
  }
  const result = db.run(
      `INSERT INTO queue (session_id, content, status, submission_id)
       VALUES (?, ?, 'pending', ?)`,
      [sessionId, content, submissionId ?? null],
    ),
    queueId = Number(result.lastInsertRowid);
  db.run("UPDATE queue SET root_id = ? WHERE id = ?", [queueId, queueId]);
  return queueId;
}
export function startQueueRecord(db: Database, sessionId: string, item: QueueItem) {
  if (item.userMessageId !== null) {
    const result = db.run(
      `UPDATE queue SET status = 'running'
       WHERE id = ? AND session_id = ?
         AND EXISTS (SELECT 1 FROM messages WHERE id = ? AND queue_id = queue.id)
         AND status IN ('pending', 'running', 'paused')`,
      [item.id, sessionId, item.userMessageId],
    );
    if (result.changes !== 1) {
      throw queueClaimConflict(item.id);
    }
    return item.userMessageId;
  }
  const messageId = insertUserMessage(db, sessionId, item.content, item.id),
    result = db.run(
      `UPDATE queue SET status = 'running', content = NULL
     WHERE id = ? AND session_id = ?
       AND status IN ('pending', 'running', 'paused')
       AND content IS NOT NULL
       AND EXISTS (SELECT 1 FROM messages WHERE id = ? AND queue_id = queue.id)`,
      [item.id, sessionId, messageId],
    );
  if (result.changes !== 1) {
    throw queueClaimConflict(item.id);
  }
  return messageId;
}
function queueClaimConflict(queueId: number) {
  return new DomainError("QUEUE_CLAIM_CONFLICT", `队列认领冲突：${queueId.toString()}`);
}
export function setQueueStatusRecord(
  db: Database,
  queueId: number,
  status: QueueStatus,
  error?: ErrorDetails,
) {
  sessionDatabase(db)
    .update(queue)
    .set({ error: error ?? (status === "paused" ? undefined : null), status })
    .where(eq(queue.id, queueId))
    .run();
}
export function pauseRunRecord(
  db: Database,
  sessionId: string,
  runId: number,
  error?: ErrorDetails,
) {
  requireSessionRecord(db, sessionId);
  return sessionDatabase(db)
    .update(queue)
    .set({ error, status: "paused" })
    .where(
      and(
        eq(queue.sessionId, sessionId),
        eq(queue.rootId, runId),
        sql`(${queue.status} IN ('running', 'paused')
          OR (${queue.status} = 'pending' AND ${queue.id} = ${queue.rootId}))`,
      ),
    )
    .run().changes;
}
export function queueStatusRecord(db: Database, queueId: number) {
  const row = cachedQuery<{ status: QueueStatus }>(db, "SELECT status FROM queue WHERE id = ?").get(
    queueId,
  );
  if (!row) {
    throw new Error(`队列不存在：${queueId.toString()}`);
  }
  return row.status;
}
function appendToRun(
  db: Database,
  sessionId: string,
  rootId: number,
  content: string,
  submissionId?: string,
) {
  const result = db.run(
    `INSERT INTO queue (session_id, root_id, content, status, submission_id)
     VALUES (?, ?, ?, 'pending', ?)`,
    [sessionId, rootId, content, submissionId ?? null],
  );
  return Number(result.lastInsertRowid);
}
