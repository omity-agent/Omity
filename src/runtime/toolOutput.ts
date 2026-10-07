import { ToolMessage } from "@langchain/core/messages";
import type { ToolOutputSnapshot } from "../types";
import { contentToText } from "./content";
import { countTokens } from "./tokenizer";
import { extractToolImages } from "./multimodal";
import { isPlainObject as isRecord } from "es-toolkit";
import { localize } from "../i18n/server";
import { stringify } from "yaml";

export type { ToolOutputSnapshot } from "../types";
export function textOutputSnapshot(content: string): ToolOutputSnapshot {
  return { content, images: [], outputTokens: countTokens(content) };
}
export function displayToolInput(value: unknown) {
  return isRecord(value) && Object.hasOwn(value, "arguments") && Object.hasOwn(value, "call_id")
    ? value["arguments"]
    : value;
}
export function toolValueText(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}
export function toolOutputText(value: unknown): string {
  return typeof value === "string" ? value : stringify(value, { lineWidth: 0 }).replace(/\n$/u, "");
}
export function cancelledToolMessage(callId: string, durationMs: number, name?: string) {
  return new ToolMessage({
    content: localize("runtime:tool.cancelled", {
      value0: formatDuration(durationMs),
    }),
    name,
    status: "error",
    tool_call_id: callId,
  });
}
function formatDuration(durationMs: number) {
  if (durationMs < 1000) {
    return localize("runtime:duration.milliseconds", {
      value0: Math.round(durationMs).toString(),
    });
  }
  const seconds = durationMs / 1000;
  return seconds < 60
    ? localize("runtime:duration.seconds", {
        value0: Number(seconds.toFixed(1)).toString(),
      })
    : localize("runtime:duration.minutesSeconds", {
        value0: Math.floor(seconds / 60).toString(),
        value1: Math.round(seconds % 60).toString(),
      });
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
    throw new Error(localize("runtime:output.metadataInvalid"));
  }
  const { tokens } = largeOutput;
  if (typeof tokens !== "number" || !Number.isSafeInteger(tokens) || tokens < 0) {
    throw new Error(localize("runtime:output.tokenCountInvalid"));
  }
  return tokens;
}
