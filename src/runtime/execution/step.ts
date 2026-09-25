import { type ActiveRun } from "../run";
import type { HostContext } from "../context";
import { waitIfPaused } from "./pause";

export async function waitAfterCompletedStep(ctx: HostContext, run: ActiveRun) {
  if (ctx.db.pauseCompletedStep(ctx.sessionId, run.id)) {
    ctx.observer?.changed?.(ctx.sessionId);
    ctx.logger.info("单步完成，已暂停", { inputId: run.items[0].id });
  }
  return waitIfPaused(ctx, run);
}
