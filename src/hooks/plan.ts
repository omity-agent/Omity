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
  awaiting?: { callId: string };
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
  const output = messages.findLast(
    (message): message is ToolMessage =>
      ToolMessage.isInstance(message) && message.tool_call_id === plan.awaiting?.callId,
  );
  if (!output) {
    return { plan };
  }
  return {
    output: readToolOutput(output),
    plan: { ...plan, awaiting: undefined, hookIndex: 0, stage: "after" as const },
  };
}
export function nextToolStage(plan: ToolHookPlan): ToolHookPlan {
  return plan.stage === "before"
    ? { ...plan, hookIndex: 0, stage: "original" }
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
