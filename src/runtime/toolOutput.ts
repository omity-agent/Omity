import { type ToolMessage } from "@langchain/core/messages";
import type { ToolOutputSnapshot } from "../types";
import { contentToText } from "./content";
import { countTokens } from "./tokenizer";
import { extractToolImages } from "./modelImages";
import { isPlainObject as isRecord } from "es-toolkit";

export type { ToolOutputSnapshot } from "../types";
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
