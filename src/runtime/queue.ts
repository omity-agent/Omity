import { CanceledRunError, type QueueRun, setRunStatus } from "./run";
import { pauseForMcpUnavailable, pauseForStop, waitIfPaused } from "./execution/pause";
import { type HostContext } from "./context";
import { HostLeaseLostError } from "./execution/lease";
import type { QueueItem } from "../types";
import { captureError } from "../failures/details";
import { runGraphUntilBoundary } from "./execution/nodeBoundary";

export async function processQueue(ctx: HostContext, item: QueueItem) {
  const end = ctx.logger.child(`队列 #${item.id.toString()}`),
    resumed = ctx.db.consumedRunItems(ctx.sessionId, item.runId),
    items: [QueueItem, ...QueueItem[]] = [item, ...resumed.filter(({ id }) => id !== item.id)];
  items.sort((left, right) => left.id - right.id);
  const root = items.find(({ root: isRoot }) => isRoot) ?? item,
    run: QueueRun = {
      items,
      rootId: root.id,
      threadId: `${ctx.sessionId}:${root.id.toString()}`,
    };
  try {
    ctx.assertLease?.();
    const advance = pauseForStop(ctx, run) ? false : await waitIfPaused(ctx, run);
    if (!advance) {
      return;
    }
    for (const runItem of run.items) {
      ctx.db.startQueue(ctx.sessionId, runItem);
    }
    if (!pauseForStop(ctx, run)) {
      await runGraphUntilBoundary(ctx, run, advance === "step");
    }
  } catch (error) {
    if (error instanceof CanceledRunError) {
      return;
    }
    if (error instanceof HostLeaseLostError) {
      throw error;
    }
    ctx.assertLease?.();
    if (run.items.every(({ id }) => isTerminal(ctx.db.queueStatus(id)))) {
      throw error;
    }
    if (ctx.controller.signal.aborted || ctx.stopping?.aborted) {
      setRunStatus(ctx, run, "paused");
      return;
    }
    if (pauseForMcpUnavailable(ctx, run, error)) {
      return;
    }
    const details = captureError(error);
    setRunStatus(ctx, run, "paused", details);
    ctx.logger.error("队列异常，已暂停", { error: details, queueId: item.id });
  } finally {
    end();
  }
}
function isTerminal(status: QueueItem["status"]) {
  return status === "done" || status === "canceled";
}
