import type {
  DisplayEvent,
  DisplayMessage,
  DisplayQueue,
  DisplayToolCall,
  DisplayToolOutput,
  TimelineMessage,
  TimelinePart,
} from "./types";
import { displayToolCallKey, sameToolCall } from "./tool/correlation";
import {
  eventMessageId,
  eventQueueId,
  streamTimelineMessages,
  toolCallLifecycle,
} from "./streamEvents";
import { linkedCall, linkedOutput, matchesFor, optionalLinks } from "./build/fileLinks";
import type { FileLinkUnit } from "../../fileLinks/types";
import { groupAssistantMessages } from "./grouping";
import { syntheticMessage } from "./build/synthetic";

export type {
  DisplayEvent,
  DisplayImage,
  DisplayMessage,
  DisplayQueue,
  DisplayRole,
  DisplayToolCall,
  DisplayToolOutput,
  TokenUsage,
  TimelineMessage,
  TimelinePart,
  ToolCallPhase,
} from "./types";
export { canCancelToolCall } from "./types";
export { displayStreamEvent } from "./streamEvents";
export function buildTimeline(
  messages: DisplayMessage[],
  queue: DisplayQueue[],
  events: DisplayEvent[],
  optimistic: TimelineMessage[] = [],
  fileLinks: FileLinkUnit[] = [],
): TimelineMessage[] {
  const outputs = new Map(
      messages.flatMap((item) =>
        item.role === "tool" && item.toolCallId
          ? [[item.toolCallId, item as DisplayToolOutput] as const]
          : [],
      ),
    ),
    persistedToolCalls = messages.flatMap((item) => item.toolCalls),
    lifecycle = toolCallLifecycle(events, outputs),
    visible = messages
      .filter((item) => item.role !== "tool")
      .map((item) =>
        withParts(item, `message-${item.id.toString()}`, outputs, lifecycle, fileLinks),
      ),
    persistedSourceIds = new Set(
      messages.map((item) => item.sourceId).filter((id) => id !== undefined),
    ),
    knownQueue = new Set(messages.map((item) => item.queueId)),
    pending = new Map(
      queue
        .filter((item) => item.status === "pending" && !knownQueue.has(item.id))
        .map(
          (item) =>
            [
              item.id,
              syntheticMessage("user", item.content, `queue-${item.id.toString()}`),
            ] as const,
        ),
    ),
    activeQueueIds = new Set(
      queue
        .filter((item) => item.status === "running" || item.status === "paused")
        .filter((item) => item.userMessageId !== null)
        .map((item) => item.id),
    ),
    liveEvents = events.filter(
      (event) =>
        (event.kind === "user_appended" && pending.has(event.queueId)) ||
        (activeQueueIds.has(eventQueueId(event)) &&
          (event.kind === "tool_call_delta" || !persistedSourceIds.has(eventMessageId(event)))),
    ),
    live = timelineTail(
      liveEvents,
      pending,
      optimistic,
      outputs,
      lifecycle,
      persistedToolCalls,
      fileLinks,
    );
  return groupAssistantMessages([...visible, ...live]);
}
function timelineTail(
  events: DisplayEvent[],
  pending: Map<number, TimelineMessage>,
  optimistic: TimelineMessage[],
  outputs: Map<string, DisplayToolOutput>,
  lifecycle: ReturnType<typeof toolCallLifecycle>,
  persistedToolCalls: DisplayToolCall[],
  fileLinks: FileLinkUnit[],
) {
  const result: TimelineMessage[] = [];
  let stream: DisplayEvent[] = [];
  const flushStream = () => {
    result.push(
      ...streamTimelineMessages(stream, outputs, lifecycle, fileLinks).flatMap((message) => {
        const parts = message.parts.filter(
          (part) =>
            part.type !== "tool" ||
            !persistedToolCalls.some((call) => sameToolCall(call, part.call)),
        );
        return parts.length > 0 ? [{ ...message, parts }] : [];
      }),
    );
    stream = [];
  };
  for (const event of events) {
    if (event.kind === "user_appended") {
      const message = pending.get(event.queueId);
      if (message) {
        flushStream();
        result.push(message);
        pending.delete(event.queueId);
      }
    } else {
      stream.push(event);
    }
  }
  flushStream();
  result.push(...pending.values());
  result.push(...optimistic);
  return result;
}
function withParts(
  message: DisplayMessage,
  key: string,
  outputs: Map<string, DisplayToolOutput>,
  lifecycle: ReturnType<typeof toolCallLifecycle>,
  fileLinks: FileLinkUnit[],
): TimelineMessage {
  return {
    content: message.content,
    createdAt: message.createdAt,
    id: message.id,
    key,
    role: message.role,
    ...(message.usage ? { usage: message.usage } : {}),
    parts: [
      ...(message.reasoning.trim()
        ? [
            {
              content: message.reasoning,
              ...optionalLinks(matchesFor(fileLinks, message.sourceId, "reasoning")),
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
  lifecycle: ReturnType<typeof toolCallLifecycle>,
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
