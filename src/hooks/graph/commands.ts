import { AIMessage, type ToolCall } from "@langchain/core/messages";
import type { AgentHookPlan, HookPlan, ToolHookPlan } from "../plan";
import { Command, END } from "@langchain/langgraph";
import type { HookRule } from "../../types";
import type { HookRuntime } from "../runtime";
import type { HookToolOutput } from "../storage/outputs";
import { partitionToolResponse } from "./responsePartition";

export const hookNode = "hooks";
export const modelNode = "model_request";
export const toolsNode = "tools";
type HookExecution = NonNullable<Awaited<ReturnType<HookRuntime["execute"]>>>;
export function hookCommand(
  plan: AgentHookPlan | ToolHookPlan,
  rule: HookRule,
  result: HookExecution,
  clearPending: boolean,
  outputs: HookToolOutput[],
) {
  const nextPlan =
    rule.mode === "takeover" && plan.kind === "tools" && plan.replaceMessageId
      ? { ...plan, replaceMessageId: undefined }
      : plan;
  const messages =
    rule.mode === "takeover"
      ? [
          new AIMessage({
            content: "",
            id: plan.kind === "tools" ? plan.replaceMessageId : undefined,
            tool_calls: [result.call],
          }),
          result.output,
        ]
      : undefined;
  return command(nextPlan, hookNode, clearPending, [...outputs, result.value], messages);
}
export function originalToolsCommand(
  plan: ToolHookPlan,
  original: AIMessage,
  calls: ToolCall[],
  outputs: HookToolOutput[],
) {
  const callIds = calls.map((call) => {
    if (!call.id) {
      throw new Error(`工具调用缺少 ID：${call.name}`);
    }
    return call.id;
  });
  if (callIds.length === 0) {
    throw new Error("原始工具批次不能为空");
  }
  if (new Set(callIds).size !== callIds.length) {
    throw new Error("原始工具批次包含重复的调用 ID");
  }
  return new Command({
    goto: toolsNode,
    update: {
      hookPlan: {
        ...plan,
        awaiting: { callIds },
        replaceMessageId: undefined,
        responseEmitted: true,
      },
      hookToolOutputs: outputs,
      messages: [
        new AIMessage({
          id: plan.replaceMessageId,
          tool_calls: calls,
          ...partitionToolResponse(original, callIds, !plan.responseEmitted),
        }),
      ],
    },
  });
}
export function finishAgent(plan: AgentHookPlan, clearPending: boolean, outputs: HookToolOutput[]) {
  if (plan.when === "before") {
    return command(null, modelNode, clearPending, outputs);
  }
  const finalMessageId = plan.sources.at(-1);
  if (!finalMessageId) {
    throw new Error("Agent after Hook 缺少最终消息 ID");
  }
  return command({ finalMessageId, kind: "done" }, END, clearPending, outputs);
}
export function command(
  plan: HookPlan | null,
  goto: string,
  clearPending: boolean,
  outputs: HookToolOutput[] = [],
  messages?: unknown[],
) {
  return new Command({
    goto,
    update: {
      hookPlan: plan,
      hookToolOutputs: outputs,
      ...(clearPending ? { hookPendingUserIds: [] } : {}),
      ...(messages ? { messages } : {}),
    },
  });
}
