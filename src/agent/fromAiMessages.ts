import {
  AIMessage,
  type BaseMessage,
  type ToolCall,
  ToolMessage,
  type UsageMetadata,
} from "@langchain/core/messages";
import type { LanguageModelUsage, ModelMessage } from "ai";
import type { ProviderOptions } from "@ai-sdk/provider-utils";

export function fromModelMessages(
  messages: ModelMessage[],
  assistantId: string,
  usage?: LanguageModelUsage,
): BaseMessage[] {
  const result: BaseMessage[] = [];
  for (const [index, message] of messages.entries()) {
    if (message.role === "assistant") {
      const providerOptions = toolProviderOptions(message.content);
      result.push(
        new AIMessage({
          additional_kwargs: {
            aiSdkContent: storedAssistantContent(message.content),
            ...(providerOptions ? { aiSdkToolProviderOptions: providerOptions } : {}),
          },
          content: assistantText(message.content).join(""),
          id: `${assistantId}:assistant:${index.toString()}`,
          tool_calls: toolCalls(message.content),
          usage_metadata: usage ? langChainUsage(usage) : undefined,
        }),
      );
    } else if (message.role === "tool") {
      for (const part of message.content) {
        if (part.type === "tool-result") {
          result.push(
            new ToolMessage({
              content: outputText(part.output),
              id: `${assistantId}:tool:${part.toolCallId}`,
              name: part.toolName,
              tool_call_id: part.toolCallId,
            }),
          );
        }
      }
    } else {
      throw new Error(`AI SDK 返回了不支持的消息角色：${message.role}`);
    }
  }
  return result;
}
function storedAssistantContent(content: Extract<ModelMessage, { role: "assistant" }>["content"]) {
  return typeof content === "string"
    ? [{ text: content, type: "text" as const }]
    : content.flatMap((part) =>
        part.type === "text" || part.type === "reasoning"
          ? [{ providerOptions: part.providerOptions, text: part.text, type: part.type }]
          : [],
      );
}
function assistantText(content: Extract<ModelMessage, { role: "assistant" }>["content"]) {
  if (typeof content === "string") {
    return [content];
  }
  return content.flatMap((part) => (part.type === "text" ? [part.text] : []));
}
function toolCalls(content: Extract<ModelMessage, { role: "assistant" }>["content"]): ToolCall[] {
  if (typeof content === "string") {
    return [];
  }
  return content
    .filter((part) => part.type === "tool-call")
    .map((part) => {
      if (typeof part.input === "string") {
        return {
          args: { input: part.input },
          id: part.toolCallId,
          isCustomTool: true,
          name: part.toolName,
          type: "tool_call" as const,
        };
      }
      if (!isRecord(part.input)) {
        throw new Error(`结构化工具 ${part.toolName} 输入必须是对象`);
      }
      return {
        args: part.input,
        id: part.toolCallId,
        name: part.toolName,
        type: "tool_call" as const,
      };
    });
}
function toolProviderOptions(content: Extract<ModelMessage, { role: "assistant" }>["content"]) {
  if (typeof content === "string") {
    return undefined;
  }
  const entries = content.flatMap((part) =>
    part.type === "tool-call" && part.providerOptions
      ? [[part.toolCallId, part.providerOptions] as const]
      : [],
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}
function langChainUsage(usage: LanguageModelUsage): UsageMetadata {
  return {
    input_token_details: { cache_read: usage.inputTokenDetails.cacheReadTokens ?? 0 },
    input_tokens: usage.inputTokens ?? 0,
    output_tokens: usage.outputTokens ?? 0,
    total_tokens: usage.totalTokens ?? 0,
  };
}
type ToolResult = Extract<
  Extract<ModelMessage, { role: "tool" }>["content"][number],
  { type: "tool-result" }
>;
function outputText(output: ToolResult["output"]) {
  if (output.type === "text" || output.type === "error-text") {
    return output.value;
  }
  if (output.type === "json" || output.type === "error-json") {
    return JSON.stringify(output.value);
  }
  if (output.type === "execution-denied") {
    return output.reason ?? "工具执行已拒绝";
  }
  return output.value.flatMap((part) => ("text" in part ? [part.text] : [])).join("");
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export interface StoredAiSdkPart {
  providerOptions?: ProviderOptions;
  text: string;
  type: "reasoning" | "text";
}
