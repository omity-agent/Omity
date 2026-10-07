import { type ActiveRun } from "../run";
import type { HostContext } from "../context";
import { localize } from "../../i18n/server";
import { waitIfPaused } from "./pause";

export async function waitAfterCompletedStep(ctx: HostContext, run: ActiveRun) {
  if (ctx.db.pauseCompletedStep(ctx.sessionId, run.id)) {
    ctx.observer?.changed?.(ctx.sessionId);
    ctx.logger.info(localize("runtime:step.completed"), {
      inputId: run.items[0].id,
    });
  }
  return waitIfPaused(ctx, run);
}
