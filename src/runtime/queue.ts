import { CanceledRunError, type QueueRun, cancelRun, finishRun, setRunStatus } from "./run";
import { type HostContext, readGraphState, streamGraph } from "./context";
import { completeActiveStream, createStreamLogState, discardActiveStream } from "./stream";
import { consumeBoundaryAppends, recoverConsumedAppends } from "./appends";
import { pauseForMcpUnavailable, pauseForStop, waitIfPaused } from "./execution/pause";
import { recordAiStreamPart, recordToolStarted } from "./aiStream";
import { HostLeaseLostError } from "./execution/lease";
import type { QueueItem } from "../types";
import { captureError } from "../failures/details";
import { isRetryableModelError } from "./network";
import { queueMessageId } from "../infrastructure/database/records/messages/history";
import { waitBeforeModelRetry } from "./retry";

export async function processQueue(ctx: HostContext, item: QueueItem) {
  const end = ctx.logger.child(`队列 #${item.id.toString()}`);
  const resumed = ctx.db.consumedRunItems(ctx.sessionId, item.runId);
  const items: [QueueItem, ...QueueItem[]] = [item, ...resumed.filter(({ id }) => id !== item.id)];
  items.sort((left, right) => left.id - right.id);
  const root = items.find(({ root: isRoot }) => isRoot) ?? item;
  const run: QueueRun = {
    items,
    rootId: root.id,
    threadId: `${ctx.sessionId}:${root.id.toString()}`,
  };
  try {
    ctx.assertLease?.();
    if (pauseForStop(ctx, run) || !(await waitIfPaused(ctx, run))) {
      return;
    }
    for (const runItem of run.items) {
      ctx.db.startQueue(ctx.sessionId, runItem);
    }
    if (!pauseForStop(ctx, run)) {
      await runGraphUntilBoundary(ctx, run);
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
async function runGraphUntilBoundary(ctx: HostContext, run: QueueRun) {
  const [item] = run.items;
  const config = {
    configurable: { thread_id: run.threadId },
    interruptAfter: ["request_model", "invoke_tool"] as string[],
    interruptBefore: ["model_request", "tools"] as string[],
    recursionLimit: ctx.settings.agent.recursionLimit,
  };
  const checkpoint = await ctx.checkpointer.getTuple(config);
  let input: Parameters<HostContext["graph"]["stream"]>[0] = checkpoint
    ? recoverConsumedAppends(ctx, run, readGraphState(await ctx.graph.getState(config)))
    : {
        hookPendingUserIds: [queueMessageId(ctx.sessionId, item.id)],
        messages: ctx.db.history(ctx.sessionId),
      };
  let retries = 0;
  const streamState = createStreamLogState();
  for (;;) {
    ctx.assertLease?.();
    if (pauseForStop(ctx, run)) {
      return;
    }
    let reachedBoundary = false;
    try {
      const stream = await streamGraph(ctx.graph, input, {
        ...config,
        signal: ctx.controller.signal,
        streamMode: ["custom", "updates", "debug"],
      });
      for await (const event of stream) {
        handleGraphEvent(ctx, item.id, event, streamState);
      }
      retries = 0;
      reachedBoundary = true;
    } catch (error) {
      discardActiveStream(ctx, streamState, item.id);
      if (!isRetryableModelError(error)) {
        throw error;
      }
      retries += 1;
      const retry = await waitBeforeModelRetry(ctx, run, error, retries, {
        cancel: () => {
          cancelRun(ctx, run);
          return Promise.reject(new CanceledRunError("运行已取消"));
        },
        pause: () => waitIfPaused(ctx, run),
        stop: () => setRunStatus(ctx, run, "paused"),
      });
      if (!retry) {
        return;
      }
    }
    if (reachedBoundary) {
      ctx.assertLease?.();
      const control = ctx.db.control(ctx.sessionId);
      if (control === "cancel") {
        cancelRun(ctx, run);
        return;
      }
      const state = readGraphState(await ctx.graph.getState(config));
      if (state.values.messages.length > 0) {
        ctx.db.syncHistory(ctx.sessionId, state.values.messages);
        completeActiveStream(streamState);
        ctx.observer?.changed?.(ctx.sessionId);
      }
      if (ctx.stopping?.aborted) {
        setRunStatus(ctx, run, "paused");
        return;
      }
      if ((control === "pause" || control === "pause_cancel") && !(await waitIfPaused(ctx, run))) {
        return;
      }
      const appendInput = consumeBoundaryAppends(ctx, run, state);
      if (appendInput) {
        input = appendInput;
      } else if (state.next.length === 0) {
        ctx.observer?.activity?.(ctx.sessionId, "idle");
        finishRun(ctx, run, state.values.messages, state.values.hookPlan);
        return;
      } else {
        const activity = state.next.includes("tools")
          ? "tool"
          : state.next.includes("model_request")
            ? "model"
            : undefined;
        if (activity) {
          ctx.observer?.activity?.(ctx.sessionId, activity);
        }
        if (activity === "tool") {
          recordToolStarted(ctx, state.values.messages, item.id);
        }
        input = null;
      }
    }
  }
}
function handleGraphEvent(
  ctx: HostContext,
  queueId: number,
  event: unknown,
  state: ReturnType<typeof createStreamLogState>,
) {
  if (Array.isArray(event)) {
    const [mode, part] = event;
    if (mode !== "custom") {
      return;
    }
    if (!isAiStreamEvent(part)) {
      throw new Error("LangGraph custom 事件不是 AI SDK 流事件");
    }
    recordAiStreamPart(ctx, queueId, part, state);
  }
}
function isAiStreamEvent(value: unknown): value is Parameters<typeof recordAiStreamPart>[2] {
  if (typeof value !== "object" || value === null || !("part" in value)) {
    return false;
  }
  const { part } = value;
  return typeof part === "object" && part !== null && "type" in part;
}
function isTerminal(status: QueueItem["status"]) {
  return status === "done" || status === "canceled";
}
