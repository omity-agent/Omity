import type {
  DisplayEvent,
  DisplayToolCall,
  DisplayToolOutput,
  TimelineMessage,
  TimelinePart,
} from "../types";
import { localStreamLinks, optionalStreamLinks } from "./fileLinks";
import type { FileLinkUnit } from "../../../fileLinks/types";
import { countTokens } from "../../../runtime/tokenizer";
import { streamCallKey } from "../tool/correlation";

export type StreamPart = TextPart | ToolPart;
type TextPart = {
  [Kind in "assistant_reasoning_delta" | "assistant_text_delta"]: {
    content: string;
    kind: Kind;
    offset: number;
  };
}["assistant_reasoning_delta" | "assistant_text_delta"];
interface ToolPart {
  args: string;
  formal?: true;
  freeform?: boolean;
  id?: string;
  index: number;
  kind: "tool_call_delta";
  name: string;
}
export interface StreamMessage {
  contentLength: number;
  firstEventId: number;
  messageId: string;
  order: string[];
  parts: Map<string, StreamPart>;
  reasoningLength: number;
}
export function createStreamPart(
  event: Exclude<DisplayEvent, { kind: "tool_finished" | "tool_started" | "user_appended" }>,
  message: StreamMessage,
): StreamPart {
  if (event.kind === "tool_call_delta") {
    return {
      args: event.value.argumentsDelta ?? "",
      ...(event.value.freeform ? { freeform: true } : {}),
      ...(event.value.idDelta ? { id: event.value.idDelta } : {}),
      index: event.value.index,
      kind: event.kind,
      name: event.value.nameDelta ?? "",
    };
  }
  const offset =
    event.kind === "assistant_text_delta" ? message.contentLength : message.reasoningLength;
  updateLength(message, event.kind, event.value.length);
  return { content: event.value, kind: event.kind, offset };
}
export function mergeStreamPart(
  part: StreamPart,
  event: Exclude<DisplayEvent, { kind: "tool_finished" | "tool_started" | "user_appended" }>,
  message: StreamMessage,
) {
  if (part.kind !== event.kind) {
    throw new Error(`流片段 ${event.partId} 的类型发生变化`);
  }
  if (part.kind === "tool_call_delta" && event.kind === "tool_call_delta") {
    if (part.index !== event.value.index) {
      throw new Error(`工具流片段 ${event.partId} 的索引发生变化`);
    }
    part.args += event.value.argumentsDelta ?? "";
    part.freeform ??= event.value.freeform;
    part.id = appendDelta(part.id, event.value.idDelta);
    part.name += event.value.nameDelta ?? "";
  } else if (part.kind !== "tool_call_delta" && event.kind !== "tool_call_delta") {
    part.content += event.value;
    updateLength(message, event.kind, event.value.length);
  }
}
export function projectStreamMessage(
  message: StreamMessage,
  outputs: Map<string, DisplayToolOutput>,
  lifecycle: Map<string, { phase: "running" } | { output: DisplayToolOutput; phase: "completed" }>,
  fileLinks: FileLinkUnit[],
): TimelineMessage {
  const parts = message.order.flatMap((partId): TimelinePart[] => {
    const part = message.parts.get(partId);
    if (!part) {
      throw new Error(`流消息缺少片段：${partId}`);
    }
    if (part.kind === "assistant_reasoning_delta") {
      return textTimelinePart(part, message.messageId, "reasoning", fileLinks);
    }
    if (part.kind === "assistant_text_delta") {
      return textTimelinePart(part, message.messageId, "content", fileLinks);
    }
    return [toolTimelinePart(part, partId, message.messageId, outputs, lifecycle, fileLinks)];
  });
  return {
    content: parts.flatMap((part) => (part.type === "content" ? [part.content] : [])).join(""),
    createdAt: 0,
    id: -1,
    key: `stream-${message.messageId}-${message.firstEventId.toString()}`,
    parts,
    role: "assistant",
  };
}
function textTimelinePart(
  part: TextPart,
  ownerId: string,
  surface: "content" | "reasoning",
  fileLinks: FileLinkUnit[],
): TimelinePart[] {
  if (!part.content.trim()) {
    return [];
  }
  const links = localStreamLinks(fileLinks, ownerId, surface, part);
  return [{ content: part.content, ...optionalStreamLinks(links), type: surface }];
}
function toolTimelinePart(
  part: ToolPart,
  partId: string,
  messageId: string,
  outputs: Map<string, DisplayToolOutput>,
  lifecycle: Map<string, { phase: "running" } | { output: DisplayToolOutput; phase: "completed" }>,
  fileLinks: FileLinkUnit[],
): Extract<TimelinePart, { type: "tool" }> {
  const callId = part.id ?? streamCallKey(messageId, partId),
    call = displayCall(
      part,
      messageId,
      partId,
      fileLinks.filter((unit) => unit.ownerId === callId && unit.surface === "tool_input"),
    ),
    key = streamCallKey(messageId, partId),
    output = outputs.get(callId);
  if (output) {
    return { call, key, output, phase: "completed", type: "tool" };
  }
  const state = lifecycle.get(call.id);
  return state?.phase === "completed"
    ? { call, key, output: state.output, phase: "completed", type: "tool" }
    : { call, key, phase: state?.phase ?? "streaming", type: "tool" };
}
function displayCall(
  part: ToolPart,
  messageId: string,
  partId: string,
  units: FileLinkUnit[],
): DisplayToolCall {
  const inputText = part.args;
  return {
    id: part.id ?? streamCallKey(messageId, partId),
    index: part.index,
    input: {},
    inputText,
    inputTokens: countTokens(inputText),
    messageId,
    name: part.name || "tool",
    ...(part.formal ? {} : { temporary: true }),
    ...(part.freeform ? { rawInput: inputText } : {}),
    ...optionalStreamLinks(units.flatMap((unit) => unit.matches)),
  };
}
function updateLength(
  message: StreamMessage,
  kind: "assistant_reasoning_delta" | "assistant_text_delta",
  length: number,
) {
  if (kind === "assistant_text_delta") {
    message.contentLength += length;
  } else {
    message.reasoningLength += length;
  }
}
function appendDelta(current: string | undefined, incoming?: string) {
  const value = (current ?? "") + (incoming ?? "");
  return value || undefined;
}
