import {
  AIMessage,
  type BaseMessage,
  type StoredMessage,
  type ToolCall,
  ToolMessage,
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
} from "@langchain/core/messages";
import { type HookToolOutput, readToolOutput } from "./storage/outputs";
import type { HookWhen } from "../types";

export interface AgentHookPlan {
  hookIndex: number;
  kind: "agent";
  sourceIndex: number;
  sources: string[];
  when: HookWhen;
}
export interface ToolHookPlan {
  awaiting?: { callIds: string[] };
  hookIndex: number;
  kind: "tools";
  original: StoredMessage;
  replaceMessageId?: string;
  responseEmitted: boolean;
  stage: "before" | "original" | "after";
  toolIndex: number;
}
export type HookPlan = AgentHookPlan | ToolHookPlan | { finalMessageId: string; kind: "done" };
export interface HookState {
  hookPendingUserIds: string[];
  hookPlan: HookPlan | null;
  hookToolOutputs: HookToolOutput[];
  messages: BaseMessage[];
}
export function agentPlan(when: HookWhen, sources: string[]): AgentHookPlan {
  return { hookIndex: 0, kind: "agent", sourceIndex: 0, sources, when };
}
export function toolPlan(message: AIMessage): ToolHookPlan {
  if (!message.id) {
    throw new Error("工具调用消息缺少 ID");
  }
  return {
    hookIndex: 0,
    kind: "tools",
    original: storeMessage(message),
    replaceMessageId: message.id,
    responseEmitted: false,
    stage: "before",
    toolIndex: 0,
  };
}
export function restoreOriginal(stored: StoredMessage) {
  const [message] = mapStoredMessagesToChatMessages([stored]);
  if (!AIMessage.isInstance(message)) {
    throw new Error("Hook 工具计划无效");
  }
  return message;
}
export function finishAwaited(plan: ToolHookPlan, messages: BaseMessage[]) {
  if (!plan.awaiting) {
    return { plan };
  }
  const outputs: HookToolOutput[] = [];
  for (const callId of plan.awaiting.callIds) {
    const message = messages.findLast(
      (candidate): candidate is ToolMessage =>
        ToolMessage.isInstance(candidate) && candidate.tool_call_id === callId,
    );
    if (!message) {
      return { plan };
    }
    outputs.push(readToolOutput(message));
  }
  return {
    outputs,
    plan: { ...plan, awaiting: undefined, hookIndex: 0, stage: "after" as const },
  };
}
export function nextToolStage(
  plan: ToolHookPlan,
  toolCount: number,
  parallel: boolean,
): ToolHookPlan {
  if (plan.stage === "before") {
    const nextIndex = plan.toolIndex + 1;
    return parallel && nextIndex < toolCount
      ? { ...plan, hookIndex: 0, toolIndex: nextIndex }
      : { ...plan, hookIndex: 0, stage: "original", toolIndex: parallel ? 0 : plan.toolIndex };
  }
  if (plan.stage !== "after") {
    throw new Error("不能跳过原始工具执行阶段");
  }
  return parallel
    ? { ...plan, hookIndex: 0, toolIndex: plan.toolIndex + 1 }
    : { ...plan, hookIndex: 0, stage: "before", toolIndex: plan.toolIndex + 1 };
}
export function requireCallId(call: ToolCall) {
  if (!call.id) {
    throw new Error(`工具调用缺少 ID：${call.name}`);
  }
  return call.id;
}
function storeMessage(message: BaseMessage) {
  const [stored] = mapChatMessagesToStoredMessages([message]);
  if (!stored) {
    throw new Error("无法序列化 Hook 原始工具调用消息");
  }
  return stored;
}
