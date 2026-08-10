import {
  AIMessage,
  type BaseMessage,
  HumanMessage,
  type MessageContent,
  ToolMessage,
} from "@langchain/core/messages";
import {
  extractToolImages,
  prepareModelImageMessages,
  toolContentText,
} from "../runtime/modelImages";
import type { ModelApi } from "../types";
import type { ModelMessage } from "ai";
import type { ProviderOptions } from "@ai-sdk/provider-utils";
import type { StoredAiSdkPart } from "./fromAiMessages";

type AssistantPart = Exclude<
  Extract<ModelMessage, { role: "assistant" }>["content"],
  string
>[number];
type AiToolCallPart = Extract<AssistantPart, { type: "tool-call" }>;
export function toModelMessages(
  messages: BaseMessage[],
  api: ModelApi = "completions",
): ModelMessage[] {
  return prepareModelImageMessages(messages, api).map((message): ModelMessage => {
    if (HumanMessage.isInstance(message)) {
      return { content: textContent(message.content), role: "user" };
    }
    if (AIMessage.isInstance(message)) {
      return {
        content: [
          ...assistantContent(message),
          ...(message.tool_calls ?? []).map((call) => modelToolCall(message, call)),
        ],
        role: "assistant",
      };
    }
    if (ToolMessage.isInstance(message)) {
      return {
        content: [
          {
            output: toolOutput(message.content, api),
            toolCallId: message.tool_call_id,
            toolName: message.name ?? "tool",
            type: "tool-result",
          },
        ],
        role: "tool",
      };
    }
    throw new Error(`不支持转换消息类型：${message.type}`);
  });
}
function modelToolCall(
  message: AIMessage,
  call: NonNullable<AIMessage["tool_calls"]>[number],
): AiToolCallPart {
  if (!call.id) {
    throw new Error(`工具调用缺少 ID：${call.name}`);
  }
  const part: AiToolCallPart = {
      input: customToolInput(call),
      toolCallId: call.id,
      toolName: call.name,
      type: "tool-call",
    },
    providerOptions = toolProviderOptions(message, call.id);
  if (providerOptions) {
    part.providerOptions = providerOptions;
  }
  return part;
}
function toolProviderOptions(message: AIMessage, callId: string): ProviderOptions | undefined {
  const byCall = message.additional_kwargs["aiSdkToolProviderOptions"];
  if (!isRecord(byCall) || !isProviderOptions(byCall[callId])) {
    return undefined;
  }
  return byCall[callId];
}
function toolOutput(content: BaseMessage["content"], api: ModelApi) {
  const images = api === "responses" ? extractToolImages(content) : [],
    text = toolContentText(content);
  if (images.length === 0) {
    return { type: "text" as const, value: text };
  }
  return {
    type: "content" as const,
    value: [
      ...(text ? [{ text, type: "text" as const }] : []),
      ...images.map(({ mimeType, src }) => ({
        data: { type: "url" as const, url: new URL(src) },
        mediaType: mimeType,
        type: "file" as const,
      })),
    ],
  };
}
function customToolInput(call: NonNullable<AIMessage["tool_calls"]>[number]) {
  if (Reflect.get(call, "isCustomTool") !== true) {
    return call.args;
  }
  const input = isRecord(call.args) ? call.args["input"] : undefined;
  if (typeof input !== "string") {
    throw new Error(`MCP free-form 工具 ${call.name} 输入必须是字符串`);
  }
  return input;
}
function assistantContent(message: AIMessage): StoredAiSdkPart[] {
  const stored = message.additional_kwargs["aiSdkContent"];
  if (Array.isArray(stored) && stored.every(isStoredAiSdkPart)) {
    return stored;
  }
  const text = textContent(message.content);
  return text ? [{ text, type: "text" }] : [];
}
function isStoredAiSdkPart(value: unknown): value is StoredAiSdkPart {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (value.type === "text" || value.type === "reasoning") &&
    "text" in value &&
    typeof value.text === "string"
  );
}
function textContent(content: MessageContent) {
  if (typeof content === "string") {
    return content;
  }
  return content
    .flatMap((part) =>
      typeof part === "string"
        ? [part]
        : part.type === "text" && typeof part["text"] === "string"
          ? [part["text"]]
          : [],
    )
    .join("");
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isProviderOptions(value: unknown): value is ProviderOptions {
  return isRecord(value) && Object.values(value).every(isJsonObject);
}
function isJsonObject(value: unknown): value is Record<string, JsonValue> {
  return isRecord(value) && Object.values(value).every(isJsonValue);
}
function isJsonValue(value: unknown): value is JsonValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    (Array.isArray(value) && value.every(isJsonValue)) ||
    isJsonObject(value)
  );
}
type JsonValue = boolean | number | string | null | JsonValue[] | { [key: string]: JsonValue };
