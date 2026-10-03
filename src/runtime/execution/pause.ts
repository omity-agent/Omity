import { type ActiveRun, CanceledRunError, cancelRun, pauseFailedRun, setRunStatus } from "../run";
import { type HostContext, waitForWake } from "../context";
import { captureError } from "../../failures/details";
import { findMcpStdioUnavailable } from "../../infrastructure/mcp/client/availability";

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
  ctx.logger.warn("MCP stdio 不可用，队列已暂停", {
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
      ctx.controller.abort(new CanceledRunError("暂停状态收到 cancel"));
      ctx.logger.warn("暂停状态收到 cancel，Host 已关闭", {
        inputId: run.items[0].id,
      });
      return false;
    }
    if (control === "cancel") {
      cancelRun(ctx, run);
      throw new CanceledRunError("运行已取消");
    }
    if (control === "running" || control === "step") {
      setRunStatus(ctx, run, "running");
      return control;
    }
    if (!pauseLogged) {
      setRunStatus(ctx, run, "paused");
      ctx.logger.info("暂停中，等待 resume 或 cancel", {
        inputId: run.items[0].id,
      });
      pauseLogged = true;
    }
    await waitForWake(ctx, ctx.settings.host.pausePollMs);
  }
}
