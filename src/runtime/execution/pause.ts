import { type ActiveRun, CanceledRunError, cancelRun, pauseFailedRun, setRunStatus } from "../run";
import { type HostContext, waitForWake } from "../context";
import { captureError } from "../../failures/details";
import { findMcpStdioUnavailable } from "../../infrastructure/mcp/client/availability";
import { localize } from "../../i18n/server";

export function pauseForStop(ctx: HostContext, run: ActiveRun) {
  if (!ctx.stopping?.aborted && !ctx.controller.signal.aborted) {
    return false;
  }
  setRunStatus(ctx, run, "paused");
  return true;
}
export function pauseForMcpUnavailable(ctx: HostContext, run: ActiveRun, error: unknown) {
  const unavailable = findMcpStdioUnavailable(error);
  if (!unavailable) {
    return false;
  }
  const details = captureError(unavailable);
  pauseFailedRun(ctx, run, details);
  ctx.logger.warn(localize("runtime:pause.mcpUnavailable"), {
    inputId: run.items[0].id,
    server: unavailable.serverName,
  });
  return true;
}
export async function waitIfPaused(ctx: HostContext, run: ActiveRun) {
  let pauseLogged = false;
  for (;;) {
    if (pauseForStop(ctx, run)) {
      return false;
    }
    const control = ctx.db.control(ctx.sessionId);
    if (control === "pause_cancel") {
      setRunStatus(ctx, run, "paused");
      ctx.controller.abort(new CanceledRunError(localize("runtime:pause.cancelled")));
      ctx.logger.warn(localize("runtime:pause.cancelledAndHostClosed"), {
        inputId: run.items[0].id,
      });
      return false;
    }
    if (control === "cancel") {
      cancelRun(ctx, run);
      throw new CanceledRunError(localize("runtime:pause.runCancelled"));
    }
    if (control === "running" || control === "step") {
      setRunStatus(ctx, run, "running");
      return control;
    }
    if (!pauseLogged) {
      setRunStatus(ctx, run, "paused");
      ctx.logger.info(localize("runtime:pause.waitingForResume"), {
        inputId: run.items[0].id,
      });
      pauseLogged = true;
    }
    await waitForWake(ctx, ctx.settings.host.pausePollMs);
  }
}
