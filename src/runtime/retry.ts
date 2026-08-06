import { type HostContext, waitForWake } from "./context";
import type { BrowserWarning } from "../types";
import { captureError } from "../failures/details";

interface RetriedRun {
  items: [{ id: number }, ...{ id: number }[]];
}
interface RetryContext {
  controller: AbortController;
  db: Pick<HostContext["db"], "control">;
  observer?: Pick<NonNullable<HostContext["observer"]>, "warning">;
  sessionId: string;
  settings: {
    model: Pick<HostContext["settings"]["model"], "retryDelayMs">;
  };
  stopping?: AbortSignal;
  wake?: (delayMs: number) => Promise<void>;
}
interface RetryControls {
  pause: () => Promise<boolean>;
  stop: () => void;
  cancel: () => Promise<void>;
}
export async function waitBeforeModelRetry(
  ctx: RetryContext,
  run: RetriedRun,
  error: unknown,
  attempt: number,
  controls: RetryControls,
) {
  const delayMs = ctx.settings.model.retryDelayMs;
  const warning: BrowserWarning = {
    code: "model_api_unavailable",
    details: {
      attempt,
      delayMs,
      error: captureError(error),
      queueId: run.items[0].id,
      sessionId: ctx.sessionId,
    },
    message: "模型 API 暂不可用，正在重试",
  };
  ctx.observer?.warning?.(ctx.sessionId, warning);
  const deadline = Date.now() + delayMs;
  while (Date.now() < deadline) {
    if (ctx.controller.signal.aborted || ctx.stopping?.aborted) {
      controls.stop();
      return false;
    }
    const control = ctx.db.control(ctx.sessionId);
    if (control === "cancel") {
      await controls.cancel();
      return false;
    }
    if (control === "pause" || control === "pause_cancel") {
      return controls.pause();
    }
    await waitForWake(ctx, Math.min(250, deadline - Date.now()));
  }
  return true;
}
