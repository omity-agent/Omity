import { AIMessage, type BaseMessage, ToolMessage } from "@langchain/core/messages";
import { contentToText, messageReasoning } from "../runtime/content";
import { freeformCallIds, rawFreeformInput } from "../runtime/freeform";
import type { FileLinkSurface } from "./types";
import { formatToolInput } from "./toolInput";
import { randomUUID } from "node:crypto";

export interface FileLinkSource {
  mode: "lines" | "output";
  ownerId: string;
  surface: FileLinkSurface;
  text: string;
}
export function messageFileLinkSources(messages: BaseMessage[]) {
  return messages.flatMap(messageSources);
}
function messageSources(message: BaseMessage): FileLinkSource[] {
  message.id ??= randomUUID();
  if (ToolMessage.isInstance(message)) {
    return [
      {
        mode: "output",
        ownerId: message.tool_call_id,
        surface: "tool_output",
        text: contentToText(message.content),
      },
    ];
  }
  const content = contentToText(message.content);
  return [
    ...(content
      ? [{ mode: "lines", ownerId: message.id, surface: "content", text: content } as const]
      : []),
    ...(AIMessage.isInstance(message) ? aiSources(message) : []),
  ];
}
function aiSources(message: AIMessage): FileLinkSource[] {
  if (!message.id) {
    throw new Error("模型消息缺少文件链接所有者 ID");
  }
  const ownerId = message.id,
    reasoning = messageReasoning(message),
    freeformIds = freeformCallIds(message);
  return [
    ...(reasoning
      ? [{ mode: "lines", ownerId, surface: "reasoning", text: reasoning } as const]
      : []),
    ...(message.tool_calls ?? []).map((call, index): FileLinkSource => {
      const callOwnerId = call.id ?? `tool-${index.toString()}`,
        input = call.args,
        freeform = Reflect.get(call, "isCustomTool") === true || freeformIds.has(callOwnerId);
      return {
        mode: "lines",
        ownerId: callOwnerId,
        surface: "tool_input",
        text: formatToolInput({
          input,
          ...(freeform ? { rawInput: rawFreeformInput(input) } : {}),
        }),
      };
    }),
  ];
}
