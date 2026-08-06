import type {
  DisplayEvent,
  DisplayMessage,
  DisplayQueue,
  DisplayRole,
  DisplayToolCall,
  TimelineMessage,
  TimelinePart,
} from "./types";
import {
  eventMessageId,
  eventQueueId,
  streamTimelineMessages,
  toolCallLifecycle,
} from "./streamEvents";
import { displayToolCallKey } from "./tool/correlation";
import { groupAssistantMessages } from "./grouping";

export type {
  DisplayEvent,
  DisplayImage,
  DisplayMessage,
  DisplayQueue,
  DisplayRole,
  DisplayToolCall,
  TokenUsage,
  TimelineMessage,
  TimelinePart,
  ToolCallPhase,
} from "./types";
export { displayStreamEvent } from "./streamEvents";
export function buildTimeline(
  messages: DisplayMessage[],
  queue: DisplayQueue[],
  events: DisplayEvent[],
  optimistic: TimelineMessage[] = [],
): TimelineMessage[] {
  const outputs = new Map(
    messages.flatMap((item) =>
      item.role === "tool" && item.toolCallId ? [[item.toolCallId, item] as const] : [],
    ),
  );
  const lifecycle = toolCallLifecycle(events, outputs);
  const visible = messages
    .filter((item) => item.role !== "tool")
    .map((item) => withParts(item, `message-${item.id.toString()}`, outputs, lifecycle));
  const persistedSourceIds = new Set(
    messages.map((item) => item.sourceId).filter((id) => id !== undefined),
  );
  const knownQueue = new Set(messages.map((item) => item.queueId));
  const pending = new Map(
    queue
      .filter((item) => item.status === "pending" && !knownQueue.has(item.id))
      .map(
        (item) =>
          [item.id, synthetic("user", item.content, `queue-${item.id.toString()}`)] as const,
      ),
  );
  const activeQueueIds = new Set(
    queue
      .filter((item) => item.status === "running" || item.status === "paused")
      .filter((item) => item.userMessageId !== null)
      .map((item) => item.id),
  );
  const liveEvents = events.filter(
    (event) =>
      (event.kind === "user_appended" && pending.has(event.queueId)) ||
      (activeQueueIds.has(eventQueueId(event)) &&
        (event.kind === "tool_call_delta" || !persistedSourceIds.has(eventMessageId(event)))),
  );
  const live = timelineTail(liveEvents, pending, optimistic, outputs, lifecycle);
  return groupAssistantMessages([...visible, ...live]);
}
function timelineTail(
  events: DisplayEvent[],
  pending: Map<number, TimelineMessage>,
  optimistic: TimelineMessage[],
  outputs: Map<string, DisplayMessage>,
  lifecycle: ReturnType<typeof toolCallLifecycle>,
) {
  const result: TimelineMessage[] = [];
  let stream: DisplayEvent[] = [];
  const flushStream = () => {
    result.push(...streamTimelineMessages(stream, outputs, lifecycle));
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
  outputs: Map<string, DisplayMessage>,
  lifecycle: ReturnType<typeof toolCallLifecycle>,
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
        ? [{ content: message.reasoning, type: "reasoning" } as const]
        : []),
      ...(message.content.trim() ? [{ content: message.content, type: "content" } as const] : []),
      ...message.toolCalls.map((call) => toolPart(call, outputs, lifecycle)),
    ],
  };
}
function toolPart(
  call: DisplayToolCall,
  outputs: Map<string, DisplayMessage>,
  lifecycle: ReturnType<typeof toolCallLifecycle>,
): Extract<TimelinePart, { type: "tool" }> {
  const key = displayToolCallKey(call);
  const output = outputs.get(call.id);
  return output
    ? { call, key, output, phase: "completed", type: "tool" }
    : { call, key, phase: lifecycle.get(call.id) ?? "pending", type: "tool" };
}
function synthetic(role: DisplayRole, content: string, key: string): TimelineMessage {
  return {
    content,
    createdAt: 0,
    id: -1,
    key,
    parts: content.trim() ? [{ content, type: "content" }] : [],
    role,
  };
}
