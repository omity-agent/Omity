import {
  AIMessage,
  type BaseMessage,
  HumanMessage,
  type ToolCall,
  ToolMessage,
} from "@langchain/core/messages";
import type { StoredAi, StoredConversationMessage, StoredTool, StoredUsage } from "./replayShape";
import { isPlainObject as isRecord } from "es-toolkit";
import { structuredToolOutput } from "../../../mcp/tools/structured";

export type MessageStorageMode = "history" | "recovery";
export function encodeMessage(message: BaseMessage, mode: MessageStorageMode) {
  if (HumanMessage.isInstance(message)) {
    return { content: message.content, type: "human" } satisfies StoredConversationMessage;
  }
  if (AIMessage.isInstance(message)) {
    return encodeAiMessage(message);
  }
  if (ToolMessage.isInstance(message)) {
    return encodeToolMessage(message, mode);
  }
  throw new Error(`不支持持久化消息类型：${message.type}`);
}
function encodeAiMessage(message: AIMessage): StoredAi {
  const reasoning = storedReasoning(message),
    usage = storedUsage(message);
  return {
    content: message.content,
    type: "ai",
    ...("aiSdkContent" in message.additional_kwargs
      ? { aiSdkContent: message.additional_kwargs["aiSdkContent"] }
      : {}),
    ...(message.tool_calls?.length ? { toolCalls: message.tool_calls.map(storedToolCall) } : {}),
    ...(reasoning === undefined ? {} : { reasoning }),
    ...(usage === undefined ? {} : { usage }),
  };
}
function encodeToolMessage(message: ToolMessage, mode: MessageStorageMode): StoredTool {
  const structuredOutput = mode === "recovery" ? structuredToolOutput(message.artifact) : undefined,
    largeOutputTokens = readLargeOutputTokens(message);
  return {
    content: message.content,
    toolCallId: message.tool_call_id,
    type: "tool",
    ...(message.metadata?.["customTool"] === true ? { custom: true } : {}),
    ...(largeOutputTokens === undefined ? {} : { largeOutputTokens }),
    ...(message.name ? { name: message.name } : {}),
    ...(structuredOutput === undefined ? {} : { structuredOutput }),
  };
}
function storedToolCall(value: ToolCall) {
  return {
    args: value.args,
    name: value.name,
    type: "tool_call" as const,
    ...(value.id ? { id: value.id } : {}),
    ...(Reflect.get(value, "isCustomTool") === true ? { isCustomTool: true } : {}),
  };
}
function storedReasoning(message: AIMessage) {
  const direct = isRecord(message.additional_kwargs["reasoning"])
      ? message.additional_kwargs["reasoning"]
      : undefined,
    { output } = message.response_metadata,
    raw = Array.isArray(output)
      ? output.find((item) => isRecord(item) && item["type"] === "reasoning")
      : undefined;
  if (!direct && !isRecord(raw)) {
    return undefined;
  }
  return {
    ...direct,
    ...(isRecord(raw) && typeof raw["encrypted_content"] === "string"
      ? { encrypted_content: raw["encrypted_content"] }
      : {}),
  };
}
function storedUsage(message: AIMessage): StoredUsage | undefined {
  if (!message.usage_metadata) {
    return undefined;
  }
  return {
    cacheRead: message.usage_metadata.input_token_details?.cache_read ?? 0,
    input: message.usage_metadata.input_tokens,
    output: message.usage_metadata.output_tokens,
  };
}
function readLargeOutputTokens(message: ToolMessage) {
  const largeOutput = message.metadata?.["largeOutput"];
  return isRecord(largeOutput) && typeof largeOutput["tokens"] === "number"
    ? largeOutput["tokens"]
    : undefined;
}
