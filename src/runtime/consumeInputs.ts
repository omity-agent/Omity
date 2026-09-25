import { type ActiveRun, CanceledRunError, setRunStatus } from "./run";
import { pauseForMcpUnavailable, pauseForStop, waitIfPaused } from "./execution/pause";
import { type HostContext } from "./context";
import { HostLeaseLostError } from "./execution/lease";
import type { QueuedInput } from "../types";
import { captureError } from "../failures/details";
import { runGraphUntilBoundary } from "./execution/nodeBoundary";

export async function processInput(ctx: HostContext, item: QueuedInput) {
  const end = ctx.logger.child(`队列 #${item.id.toString()}`),
    resumed = ctx.db.consumedInputs(ctx.sessionId, item.runId),
    items: [QueuedInput, ...QueuedInput[]] = [item, ...resumed.filter(({ id }) => id !== item.id)];
  items.sort((left, right) => left.id - right.id);
  const run: ActiveRun = {
    id: item.runId,
    items,
    threadId: item.runId.toString(),
  };
  try {
    ctx.assertLease?.();
    const advance = pauseForStop(ctx, run) ? false : await waitIfPaused(ctx, run);
    if (!advance) {
      return;
    }
    for (const runItem of run.items) {
      ctx.db.consumeInput(ctx.sessionId, runItem);
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
    if (isTerminal(ctx.db.runStatus(run.id))) {
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
    ctx.logger.error("队列异常，已暂停", { error: details, inputId: item.id });
  } finally {
    end();
  }
}
function isTerminal(status: QueuedInput["status"]) {
  return status === "done" || status === "canceled";
}
