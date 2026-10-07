import { AIMessage, type BaseMessage, type ToolCall, ToolMessage } from "@langchain/core/messages";
import { localize } from "../../i18n/server";
import { requireCallId } from "../../hooks/plan";

type IdentifiedToolCall = ToolCall & { id: string };
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
    throw new Error(localize("agent:graph.duplicateCallId"));
  }
  if (pending.length === 0) {
    throw new Error(localize("agent:graph.noPendingToolCalls"));
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
