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
import { isJSONValue, isPlainObject } from "es-toolkit";
import type { ModelApi } from "../types";
import type { ModelMessage } from "ai";
import type { SharedV4ProviderOptions as ProviderOptions } from "@ai-sdk/provider";
import type { StoredAiSdkPart } from "./fromAiMessages";
import { isProviderOptions } from "./toolProviderOptions";

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
  if (!isPlainObject(byCall) || !isProviderOptions(byCall[callId])) {
    return undefined;
  }
  return byCall[callId];
}
function toolOutput(content: BaseMessage["content"], api: ModelApi) {
  const images = api !== "completions" ? extractToolImages(content) : [],
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
  const input = isPlainObject(call.args) ? call.args["input"] : undefined;
  if (typeof input !== "string") {
    throw new Error(`MCP free-form 工具 ${call.name} 输入必须是字符串`);
  }
  return input;
}
function assistantContent(message: AIMessage): StoredAiSdkPart[] {
  const stored = message.additional_kwargs["aiSdkContent"];
  if (stored !== undefined) {
    if (!Array.isArray(stored) || !stored.every(isStoredAiSdkPart)) {
      throw new Error("会话保存的 AI SDK 内容格式无效");
    }
    return stored;
  }
  const text = textContent(message.content);
  return text ? [{ text, type: "text" }] : [];
}
function isStoredAiSdkPart(value: unknown): value is StoredAiSdkPart {
  if (
    !isPlainObject(value) ||
    (value["providerOptions"] !== undefined && !isProviderOptions(value["providerOptions"]))
  ) {
    return false;
  }
  if (value["type"] === "text" || value["type"] === "reasoning") {
    return typeof value["text"] === "string";
  }
  if (typeof value["toolCallId"] !== "string" || typeof value["toolName"] !== "string") {
    return false;
  }
  if (value["type"] === "tool-call") {
    return value["providerExecuted"] === true && isJSONValue(value["input"]);
  }
  const { output } = value;
  return (
    value["type"] === "tool-result" &&
    isPlainObject(output) &&
    (output["type"] === "json" || output["type"] === "error-json"
      ? isJSONValue(output["value"])
      : (output["type"] === "text" || output["type"] === "error-text") &&
        typeof output["value"] === "string")
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
