import { AIMessage, type BaseMessage, type ToolCall, ToolMessage } from "@langchain/core/messages";
import { requireCallId } from "../../hooks/plan";

export type IdentifiedToolCall = ToolCall & { id: string };
export function pendingToolBatch(messages: BaseMessage[], parallel: boolean): IdentifiedToolCall[] {
  const completed = new Set(
      messages
        .filter((message) => ToolMessage.isInstance(message))
        .map((message) => message.tool_call_id),
    ),
    request = messages.findLast((message) => AIMessage.isInstance(message)),
    calls = (request?.tool_calls ?? []).filter(identifiedToolCall),
    callIds = calls.map((call) => call.id),
    pending = calls.filter((call) => !completed.has(call.id));
  if (new Set(callIds).size !== callIds.length) {
    throw new Error("工具请求包含重复的调用 ID");
  }
  if (pending.length === 0) {
    throw new Error("工具节点没有待执行的工具调用");
  }
  return parallel ? pending : pending.slice(0, 1);
}

export async function invokeToolBatch<T>(
  calls: ToolCall[],
  invoke: (call: ToolCall) => Promise<T>,
): Promise<T[]> {
  const results = await Promise.allSettled(calls.map(invoke)),
    outputs: T[] = [];
  for (const result of results) {
    if (result.status === "rejected") {
      throw result.reason;
    }
    outputs.push(result.value);
  }
  return outputs;
}

function identifiedToolCall(call: ToolCall): call is IdentifiedToolCall {
  requireCallId(call);
  return true;
}
