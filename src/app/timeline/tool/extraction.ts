import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { DisplayMessage, DisplayToolCall } from "../contracts/projection";
import {
  displayToolInput,
  textOutputSnapshot,
  toolOutputText,
  toolValueText,
} from "../../../runtime/toolOutput";
import type { StoredAiSdkPart } from "../../../agent/fromAiMessages";
import { assistantContent } from "../../../agent/aiMessages";
import { isPlainObject } from "es-toolkit";
import { rawFreeformInput } from "../../../runtime/freeform";
import { toolInputTokens } from "../tokenCounts";

type StoredToolResult = Extract<StoredAiSdkPart, { type: "tool-result" }>;
export function extractToolActivity(
  message: BaseMessage,
): Pick<DisplayMessage, "toolCalls" | "toolOutputs"> {
  if (!AIMessage.isInstance(message)) {
    return { toolCalls: [] };
  }
  const content = assistantContent(message),
    hosted = content.flatMap((part) =>
      part.type === "tool-call"
        ? [
            {
              id: part.toolCallId,
              input: displayToolInput(part.input),
              name: part.toolName,
              providerExecuted: true as const,
            },
          ]
        : [],
    ),
    calls = [...hosted, ...(message.tool_calls ?? [])],
    outputs = content.flatMap((part) =>
      part.type === "tool-result"
        ? [[part.toolCallId, textOutputSnapshot(displayOutput(part.output))] as const]
        : [],
    );
  return {
    toolCalls: calls.map((call, index) => displayInvocation(call, index, message.id)),
    ...(outputs.length > 0 ? { toolOutputs: Object.fromEntries(outputs) } : {}),
  };
}
function displayOutput(output: StoredToolResult["output"]) {
  if (output.type === "text" || output.type === "error-text") {
    return output.value;
  }
  if (output.type === "json" || output.type === "error-json") {
    return toolOutputText(output.value);
  }
  if (output.type === "execution-denied") {
    return output.reason ?? "工具执行已拒绝";
  }
  return output.value.flatMap((part) => ("text" in part ? [part.text] : [])).join("");
}
function displayInvocation(
  call: Record<string, unknown>,
  index: number,
  messageId?: string,
): DisplayToolCall {
  const input = call["args"] ?? call["input"] ?? call,
    callId = typeof call["id"] === "string" ? call["id"] : undefined,
    freeform = call["isCustomTool"] === true,
    providerExecuted = call["providerExecuted"] === true,
    toolCall: DisplayToolCall = {
      id: callId ?? `tool-${index.toString()}`,
      index,
      input,
      inputTokens: toolInputTokens(call, input),
      name: typeof call["name"] === "string" ? call["name"] : "tool",
      ...(messageId ? { messageId } : {}),
      ...(callId ? {} : { temporary: true }),
      ...(providerExecuted ? { providerExecuted: true } : {}),
      ...(freeform ? { rawInput: rawFreeformInput(input) } : {}),
    };
  if (providerExecuted && !isPlainObject(input)) {
    toolCall.rawInput = toolValueText(input);
  }
  return toolCall;
}
