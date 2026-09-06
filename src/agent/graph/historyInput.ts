import { AIMessage, type BaseMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { toolPlan } from "../../hooks/plan";

export function historyInput(messages: BaseMessage[]) {
  const last = messages.at(-1),
    request = messages.findLast((message) => AIMessage.isInstance(message)),
    completed = new Set(
      messages
        .filter((message) => ToolMessage.isInstance(message))
        .map((message) => message.tool_call_id),
    ),
    pendingTools = request?.tool_calls?.some((call) => !completed.has(call.id!));
  return {
    hookPendingUserIds: last && HumanMessage.isInstance(last) && last.id ? [last.id] : [],
    hookPlan: request && pendingTools ? toolPlan(request) : null,
    messages,
  };
}
