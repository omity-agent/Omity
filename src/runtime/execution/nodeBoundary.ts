import { CanceledRunError, type QueueRun, cancelRun, finishRun, setRunStatus } from "../run";
import { type HostContext, readGraphState, streamGraph } from "../context";
import { completeActiveStream, createStreamLogState, discardActiveStream } from "../stream";
import { consumeBoundaryAppends, recoverConsumedAppends } from "../appends";
import { pauseForStop, waitIfPaused } from "./pause";
import { recordAiStreamPart, recordToolStarted } from "../aiStream";
import { isRetryableModelError } from "../network";
import { queueMessageId } from "../../infrastructure/database/records/messages/history";
import { waitAfterCompletedStep } from "./step";
import { waitBeforeModelRetry } from "../retry";

type AgentOperation = "model" | "tools";
export async function runGraphUntilBoundary(
  ctx: HostContext,
  run: QueueRun,
  initialStepping: boolean,
) {
  const [item] = run.items;
  const config = {
    configurable: { thread_id: run.threadId },
    interruptAfter: ["request_model", "invoke_tool"] as string[],
    interruptBefore: ["model_request", "tools"] as string[],
    recursionLimit: ctx.settings.agent.recursionLimit,
  };
  const checkpoint = await ctx.checkpointer.getTuple(config);
  let state = checkpoint ? readGraphState(await ctx.graph.getState(config)) : undefined;
  let input: Parameters<HostContext["graph"]["stream"]>[0] = state
    ? recoverConsumedAppends(ctx, run, state)
    : {
        hookPendingUserIds: [queueMessageId(ctx.sessionId, item.id)],
        messages: ctx.db.history(ctx.sessionId),
      };
  let retries = 0;
  let steppedOperation: AgentOperation | undefined;
  let stepping = initialStepping;
  const streamState = createStreamLogState();
  for (;;) {
    ctx.assertLease?.();
    if (pauseForStop(ctx, run)) {
      return;
    }
    let operation: AgentOperation | undefined;
    if (input === null && state) {
      operation = nextOperation(state.next);
      if (operation && stepIsComplete(steppedOperation, operation)) {
        const advance = await waitAfterCompletedStep(ctx, run);
        if (!advance) {
          return;
        }
        stepping = advance === "step";
        steppedOperation = undefined;
      }
      if (operation) {
        announceOperation(ctx, item.id, operation, state.values.messages);
      }
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
      if (stepping && operation) {
        steppedOperation ??= operation;
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
        pause: async () => (await waitIfPaused(ctx, run)) !== false,
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
      state = readGraphState(await ctx.graph.getState(config));
      if (state.values.messages.length > 0) {
        ctx.db.syncHistory(ctx.sessionId, state.values.messages);
        completeActiveStream(streamState);
        ctx.observer?.changed?.(ctx.sessionId);
      }
      if (ctx.stopping?.aborted) {
        setRunStatus(ctx, run, "paused");
        return;
      }
      if (control === "pause" || control === "pause_cancel") {
        const advance = await waitIfPaused(ctx, run);
        if (!advance) {
          return;
        }
        stepping = advance === "step";
        steppedOperation = undefined;
      } else if (control === "running") {
        stepping = false;
        steppedOperation = undefined;
      } else if (!stepping) {
        stepping = true;
        steppedOperation = undefined;
      }
      const appendInput = consumeBoundaryAppends(ctx, run, state);
      if (appendInput) {
        input = appendInput;
      } else if (state.next.length === 0) {
        ctx.observer?.activity?.(ctx.sessionId, "idle");
        finishRun(ctx, run, state.values.messages, state.values.hookPlan);
        return;
      } else {
        input = null;
      }
    }
  }
}
function nextOperation(next: string[]): AgentOperation | undefined {
  const operations = [
    ...(next.includes("model_request") ? (["model"] as const) : []),
    ...(next.includes("tools") ? (["tools"] as const) : []),
  ];
  if (operations.length > 1) {
    throw new Error("Agent 图同时调度了模型与工具节点");
  }
  return operations[0];
}
function stepIsComplete(completed: AgentOperation | undefined, next: AgentOperation) {
  return completed === "model" || (completed === "tools" && next === "model");
}
function announceOperation(
  ctx: HostContext,
  queueId: number,
  operation: AgentOperation,
  messages: Parameters<typeof recordToolStarted>[1],
) {
  ctx.observer?.activity?.(ctx.sessionId, operation === "tools" ? "tool" : "model");
  if (operation === "tools") {
    recordToolStarted(ctx, messages, queueId);
  }
}
function handleGraphEvent(
  ctx: HostContext,
  queueId: number,
  event: unknown,
  state: ReturnType<typeof createStreamLogState>,
) {
  if (!Array.isArray(event)) {
    return;
  }
  const [mode, part] = event;
  if (mode !== "custom") {
    return;
  }
  if (!isAiStreamEvent(part)) {
    throw new Error("LangGraph custom 事件不是 AI SDK 流事件");
  }
  recordAiStreamPart(ctx, queueId, part, state);
}
function isAiStreamEvent(value: unknown): value is Parameters<typeof recordAiStreamPart>[2] {
  if (typeof value !== "object" || value === null || !("part" in value)) {
    return false;
  }
  const { part } = value;
  return typeof part === "object" && part !== null && "type" in part;
}
