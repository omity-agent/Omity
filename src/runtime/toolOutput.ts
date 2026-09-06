import { ToolMessage } from "@langchain/core/messages";
import type { ToolOutputSnapshot } from "../types";
import { contentToText } from "./content";
import { countTokens } from "./tokenizer";
import { extractToolImages } from "./modelImages";
import { isPlainObject as isRecord } from "es-toolkit";

export type { ToolOutputSnapshot } from "../types";
export function cancelledToolMessage(callId: string, durationMs: number, name?: string) {
  return new ToolMessage({
    content: `工具运行 ${formatDuration(durationMs)} 后被用户手动终止。`,
    name,
    status: "error",
    tool_call_id: callId,
  });
}
function formatDuration(durationMs: number) {
  if (durationMs < 1000) {
    return `${Math.round(durationMs).toString()} 毫秒`;
  }
  const seconds = durationMs / 1000;
  return seconds < 60
    ? `${Number(seconds.toFixed(1)).toString()} 秒`
    : `${Math.floor(seconds / 60).toString()} 分 ${Math.round(seconds % 60).toString()} 秒`;
}
export function toolOutputSnapshot(message: ToolMessage): ToolOutputSnapshot {
  const content = contentToText(message.content);
  return {
    content,
    images: extractToolImages(message.content),
    outputTokens: toolOutputTokens(message, content),
  };
}
export function toolOutputTokens(message: ToolMessage, text: string) {
  const largeOutput: unknown = message.metadata?.["largeOutput"];
  if (largeOutput === undefined) {
    return countTokens(text);
  }
  if (!isRecord(largeOutput)) {
    throw new Error("工具大输出 metadata 无效");
  }
  const { tokens } = largeOutput;
  if (typeof tokens !== "number" || !Number.isSafeInteger(tokens) || tokens < 0) {
    throw new Error("工具大输出 token 数无效");
  }
  return tokens;
}
