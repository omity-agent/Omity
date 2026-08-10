import { END, type LangGraphRunnableConfig } from "@langchain/langgraph";
import {
  type HookPlan,
  type HookState,
  agentPlan,
  finishAwaited,
  nextToolStage,
  requireCallId,
  restoreOriginal,
} from "../plan";
import type { ToolCall, ToolMessage } from "@langchain/core/messages";
import { command, finishAgent, hookCommand, modelNode, originalToolsCommand } from "./commands";
import type { HookRule } from "../../types";
import type { HookRuntime } from "../runtime";

type ConsumeHook = (hookId: string, limit: number) => Promise<boolean>;
type InvokeTool = (call: ToolCall) => Promise<ToolMessage>;
interface HookNodeOptions {
  parallelToolCalls: boolean;
}
export function createHookNode(
  hooks: HookRuntime,
  consumeHook: ConsumeHook,
  invokeTool: InvokeTool,
  options: HookNodeOptions,
) {
  return async (state: HookState, config: LangGraphRunnableConfig) => {
    const threadId = requireThreadId(config.configurable);
    let plan = initialPlan(state),
      outputs = state.hookPlan ? state.hookToolOutputs : [],
      clearPending = !state.hookPlan && state.hookPendingUserIds.length > 0;
    if (plan?.kind === "agent" && plan.when === "after" && state.hookPendingUserIds.length > 0) {
      plan = agentPlan("before", state.hookPendingUserIds);
      clearPending = true;
    }
    if (!plan) {
      return command(null, modelNode, clearPending, outputs);
    }
    if (plan.kind === "done") {
      return command(plan, END, clearPending, outputs);
    }
    if (plan.kind === "tools") {
      const { plan: advancedPlan, outputs: completedOutputs } = finishAwaited(plan, state.messages);
      plan = advancedPlan;
      if (completedOutputs) {
        outputs = [...outputs, ...completedOutputs];
      }
    }
    for (;;) {
      if (plan.kind === "agent") {
        const sourceId = plan.sources[plan.sourceIndex];
        if (!sourceId) {
          return finishAgent(plan, clearPending, outputs);
        }
        const rule = hooks.matching("agent", plan.when)[plan.hookIndex];
        if (!rule) {
          plan = { ...plan, hookIndex: 0, sourceIndex: plan.sourceIndex + 1 };
        } else {
          const result = await executeRule(
            rule,
            sourceId,
            hooks,
            threadId,
            consumeHook,
            invokeTool,
            outputs,
          );
          plan = { ...plan, hookIndex: plan.hookIndex + 1 };
          if (result) {
            return hookCommand(plan, rule, result, clearPending, outputs);
          }
        }
      } else {
        const original = restoreOriginal(plan.original),
          call = original.tool_calls?.[plan.toolIndex];
        if (!call) {
          return command(null, modelNode, clearPending, outputs);
        }
        if (plan.stage === "original") {
          const calls = options.parallelToolCalls ? (original.tool_calls ?? []) : [call];
          return originalToolsCommand(plan, original, calls, outputs);
        }
        const rule = hooks.matching(call.name, plan.stage)[plan.hookIndex];
        if (!rule) {
          plan = nextToolStage(plan, original.tool_calls?.length ?? 0, options.parallelToolCalls);
        } else {
          const result = await executeRule(
            rule,
            requireCallId(call),
            hooks,
            threadId,
            consumeHook,
            invokeTool,
            outputs,
          );
          plan = { ...plan, hookIndex: plan.hookIndex + 1 };
          if (result) {
            return hookCommand(plan, rule, result, clearPending, outputs);
          }
        }
      }
    }
  };
}
function initialPlan(state: HookState): HookPlan | null {
  return (
    state.hookPlan ??
    (state.hookPendingUserIds.length > 0 ? agentPlan("before", state.hookPendingUserIds) : null)
  );
}
function executeRule(
  rule: HookRule,
  sourceId: string,
  hooks: HookRuntime,
  threadId: string,
  consume: ConsumeHook,
  invoke: InvokeTool,
  toolOutputs: HookState["hookToolOutputs"],
) {
  return hooks.execute(rule, sourceId, threadId, { consume, invoke, toolOutputs });
}
function requireThreadId(configurable: Record<string, unknown> | undefined) {
  const threadId = configurable?.["thread_id"];
  if (typeof threadId !== "string" || !threadId) {
    throw new Error("Hook 执行缺少 thread_id");
  }
  return threadId;
}
