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
import { command, finishAgent, hookCommand, modelNode, originalToolCommand } from "./commands";
import type { HookRule } from "../../types";
import type { HookRuntime } from "../runtime";

type ConsumeHook = (hookId: string, limit: number) => Promise<boolean>;
type InvokeGraphTool = (call: ToolCall) => Promise<ToolMessage>;
export function createHookNode(
  hooks: HookRuntime,
  consumeHook: ConsumeHook,
  invokeTool: InvokeGraphTool,
) {
  return async (state: HookState, config: LangGraphRunnableConfig) => {
    const threadId = requireThreadId(config.configurable);
    let plan = initialPlan(state);
    let toolOutputs = state.hookPlan ? state.hookToolOutputs : [];
    let clearPending = !state.hookPlan && state.hookPendingUserIds.length > 0;
    if (plan?.kind === "agent" && plan.when === "after" && state.hookPendingUserIds.length > 0) {
      plan = agentPlan("before", state.hookPendingUserIds);
      clearPending = true;
    }
    if (!plan) {
      return command(null, modelNode, clearPending, toolOutputs);
    }
    if (plan.kind === "done") {
      return command(plan, END, clearPending, toolOutputs);
    }
    if (plan.kind === "tools") {
      const { output, plan: advancedPlan } = finishAwaited(plan, state.messages);
      plan = advancedPlan;
      if (output) {
        toolOutputs = [...toolOutputs, output];
      }
    }
    for (;;) {
      if (plan.kind === "agent") {
        const sourceId = plan.sources[plan.sourceIndex];
        if (!sourceId) {
          return finishAgent(plan, clearPending, toolOutputs);
        }
        const rule = hooks.matching("agent", plan.when)[plan.hookIndex];
        if (!rule) {
          plan = { ...plan, hookIndex: 0, sourceIndex: plan.sourceIndex + 1 };
        } else {
          const result = await executeHook(
            rule,
            sourceId,
            hooks,
            threadId,
            consumeHook,
            invokeTool,
            toolOutputs,
          );
          plan = { ...plan, hookIndex: plan.hookIndex + 1 };
          if (result) {
            return hookCommand(plan, rule, result, clearPending, toolOutputs);
          }
        }
      } else {
        const original = restoreOriginal(plan.original);
        const call = original.tool_calls?.[plan.toolIndex];
        if (!call) {
          return command(null, modelNode, clearPending, toolOutputs);
        }
        if (plan.stage === "original") {
          return originalToolCommand(plan, original, call, toolOutputs);
        }
        const rule = hooks.matching(call.name, plan.stage)[plan.hookIndex];
        if (!rule) {
          plan = nextToolStage(plan);
        } else {
          const result = await executeHook(
            rule,
            requireCallId(call),
            hooks,
            threadId,
            consumeHook,
            invokeTool,
            toolOutputs,
          );
          plan = { ...plan, hookIndex: plan.hookIndex + 1 };
          if (result) {
            return hookCommand(plan, rule, result, clearPending, toolOutputs);
          }
        }
      }
    }
  };
}
function initialPlan(state: HookState): HookPlan | null {
  if (state.hookPlan) {
    return state.hookPlan;
  }
  return state.hookPendingUserIds.length > 0 ? agentPlan("before", state.hookPendingUserIds) : null;
}
function executeHook(
  rule: HookRule,
  sourceId: string,
  hooks: HookRuntime,
  threadId: string,
  consumeHook: ConsumeHook,
  invokeTool: InvokeGraphTool,
  toolOutputs: HookState["hookToolOutputs"],
) {
  return hooks.run(rule, sourceId, threadId, {
    consume: consumeHook,
    invoke: invokeTool,
    toolOutputs,
  });
}
export function requireThreadId(configurable: Record<string, unknown> | undefined) {
  const threadId = configurable?.["thread_id"];
  if (typeof threadId !== "string" || !threadId) {
    throw new Error("Hook 执行缺少 thread_id");
  }
  return threadId;
}
export { hookNode } from "./commands";
