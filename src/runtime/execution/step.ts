import type { HostContext } from "../context";
import { type QueueRun } from "../run";
import { waitIfPaused } from "./pause";

export async function advanceAfterCompletedStep(ctx: HostContext, run: QueueRun) {
  if (!ctx.db.pauseCompletedStep(ctx.sessionId, run.rootId)) {
    return waitIfPaused(ctx, run);
  }
  ctx.observer?.changed?.(ctx.sessionId);
  ctx.logger.info("单步完成，已暂停", { queueId: run.items[0].id });
  return false;
}
