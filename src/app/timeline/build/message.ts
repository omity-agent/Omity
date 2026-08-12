import type {
  DisplayMessage,
  DisplayToolCall,
  DisplayToolOutput,
  ReasoningTranslation,
  TimelineMessage,
  TimelinePart,
} from "../types";
import { linkedCall, linkedOutput, matchesFor, optionalLinks } from "./fileLinks";
import type { FileLinkUnit } from "../../../fileLinks/types";
import { displayToolCallKey } from "../tool/correlation";

type ToolLifecycle = Map<
  string,
  { phase: "running" } | { output: DisplayToolOutput; phase: "completed" }
>;
export function persistedTimelineMessage(
  message: DisplayMessage,
  outputs: Map<string, DisplayToolOutput>,
  lifecycle: ToolLifecycle,
  fileLinks: FileLinkUnit[],
  reasoningTranslations: ReasoningTranslation[],
): TimelineMessage {
  return {
    content: message.content,
    createdAt: message.createdAt,
    id: message.id,
    key: `message-${message.id.toString()}`,
    role: message.role,
    ...(message.usage ? { usage: message.usage } : {}),
    parts: [
      ...(message.reasoning.trim()
        ? [
            {
              content: message.reasoning,
              ...optionalLinks(matchesFor(fileLinks, message.sourceId, "reasoning")),
              ...(message.sourceId ? { messageId: message.sourceId } : {}),
              translations: reasoningTranslations.filter(
                (translation) => translation.source === message.reasoning,
              ),
              type: "reasoning",
            } as const,
          ]
        : []),
      ...(message.content.trim()
        ? [
            {
              content: message.content,
              ...optionalLinks(matchesFor(fileLinks, message.sourceId, "content")),
              type: "content",
            } as const,
          ]
        : []),
      ...message.toolCalls.map((call) => toolPart(call, outputs, lifecycle, fileLinks)),
    ],
  };
}
function toolPart(
  call: DisplayToolCall,
  outputs: Map<string, DisplayToolOutput>,
  lifecycle: ToolLifecycle,
  fileLinks: FileLinkUnit[],
): Extract<TimelinePart, { type: "tool" }> {
  const key = displayToolCallKey(call),
    withLinks = linkedCall(call, fileLinks),
    output = outputs.get(call.id);
  if (output) {
    return {
      call: withLinks,
      key,
      output: linkedOutput(output, call.id, fileLinks),
      phase: "completed",
      type: "tool",
    };
  }
  const state = lifecycle.get(call.id);
  if (state?.phase === "completed") {
    return {
      call: withLinks,
      key,
      output: linkedOutput(state.output, call.id, fileLinks),
      phase: "completed",
      type: "tool",
    };
  }
  return { call: withLinks, key, phase: state?.phase ?? "pending", type: "tool" };
}
