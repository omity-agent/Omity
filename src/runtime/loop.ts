import { type HostContext, waitForWake } from "./context";
import { localize } from "../i18n/server";
import { processInput } from "./consumeInputs";

export async function hostLoop(ctx: HostContext) {
  let lastIdle = 0;
  while (!ctx.controller.signal.aborted) {
    ctx.assertLease?.();
    const item = ctx.db.nextInput(ctx.sessionId);
    if (ctx.stopping?.aborted) {
      if (item) {
        await processInput(ctx, item);
      }
      return;
    }
    if (!item) {
      ctx.observer?.activity?.(ctx.sessionId, "idle");
      if (!ctx.db.reclaimStorageIfPending()) {
        ctx.logger.debug(localize("runtime:loop.storageReclaimDelayed"));
      }
      if (ctx.db.control(ctx.sessionId) === "pause_cancel") {
        ctx.db.setControl(ctx.sessionId, "pause");
        ctx.logger.warn(localize("runtime:loop.pausedAfterCancel"), {
          sessionId: ctx.sessionId,
        });
        return;
      }
      if (ctx.db.control(ctx.sessionId) === "cancel") {
        ctx.db.setControl(ctx.sessionId, "running");
        ctx.logger.warn(localize("runtime:loop.closedAfterCancel"), {
          sessionId: ctx.sessionId,
        });
        return;
      }
      const now = Date.now();
      if (now - lastIdle >= ctx.settings.host.idleLogMs) {
        ctx.logger.debug(localize("runtime:loop.waitingForClientInput"), {
          sessionId: ctx.sessionId,
        });
        lastIdle = now;
      }
      await waitForWake(ctx, ctx.settings.host.pollMs);
    } else {
      ctx.observer?.activity?.(ctx.sessionId, "waiting");
      await processInput(ctx, item);
    }
  }
}
