import {
  AIMessage,
  type BaseMessage,
  HumanMessage,
  type MessageContent,
  ToolMessage,
} from "@langchain/core/messages";
import { type ModelMessage, assistantModelMessageSchema } from "ai";
import { type StoredAiSdkPart, isStoredAssistantPart } from "./fromAiMessages";
import { isJSONValue, isPlainObject } from "es-toolkit";
import type { ModelApi } from "../types";
import type { SharedV4ProviderOptions as ProviderOptions } from "@ai-sdk/provider";
import { isProviderOptions } from "./toolProviderOptions";
import { localize } from "../i18n/server";
import { modelToolOutput } from "../runtime/multimodal";

type AssistantPart = Exclude<
  Extract<ModelMessage, { role: "assistant" }>["content"],
  string
>[number];
type AiToolCallPart = Extract<AssistantPart, { type: "tool-call" }>;
export function toModelMessages(
  messages: BaseMessage[],
  api: ModelApi = "completions",
): ModelMessage[] {
  return messages.map((message): ModelMessage => {
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
            output: modelToolOutput(message.content, api),
            toolCallId: message.tool_call_id,
            toolName: message.name ?? "tool",
            type: "tool-result",
          },
        ],
        role: "tool",
      };
    }
    throw new Error(localize("agent:messages.typeUnsupported", { value0: message.type }));
  });
}
function modelToolCall(
  message: AIMessage,
  call: NonNullable<AIMessage["tool_calls"]>[number],
): AiToolCallPart {
  if (!call.id) {
    throw new Error(localize("agent:messages.toolCallIdMissing", { value0: call.name }));
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
function customToolInput(call: NonNullable<AIMessage["tool_calls"]>[number]) {
  if (Reflect.get(call, "isCustomTool") !== true) {
    return call.args;
  }
  const input = isPlainObject(call.args) ? call.args["input"] : undefined;
  if (typeof input !== "string") {
    throw new Error(localize("agent:messages.freeformInputNotString", { value0: call.name }));
  }
  return input;
}
export function assistantContent(message: AIMessage): StoredAiSdkPart[] {
  const stored = message.additional_kwargs["aiSdkContent"];
  if (stored !== undefined) {
    const parsed = assistantModelMessageSchema.safeParse({ content: stored, role: "assistant" });
    if (
      !parsed.success ||
      typeof parsed.data.content === "string" ||
      !parsed.data.content.every(isStoredAssistantPart) ||
      parsed.data.content.some((part) => part.type === "tool-call" && !isJSONValue(part.input))
    ) {
      throw new Error(localize("agent:messages.persistedContentInvalid"));
    }
    return parsed.data.content;
  }
  const text = textContent(message.content);
  return text ? [{ text, type: "text" }] : [];
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
