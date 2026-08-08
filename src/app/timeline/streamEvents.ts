import type { DisplayEvent, DisplayToolOutput, TimelineMessage } from "./types";
import {
  type StreamMessage,
  createStreamPart,
  mergeStreamPart,
  projectStreamMessage,
} from "./stream/message";
import type { FileLinkUnit } from "../../fileLinks/types";
import { reconcileToolStreams } from "./tool/correlation";

type ToolLifecycle = { phase: "running" } | { output: DisplayToolOutput; phase: "completed" };
export function displayStreamEvent(event: DisplayEvent): DisplayEvent {
  return event;
}
export function eventQueueId(event: DisplayEvent) {
  return event.queueId;
}
export function eventMessageId(event: DisplayEvent) {
  return event.messageId;
}
export function toolCallLifecycle(events: DisplayEvent[], outputs: Map<string, DisplayToolOutput>) {
  const phases = new Map<string, ToolLifecycle>();
  for (const event of events) {
    if (event.kind === "tool_started") {
      phases.set(event.value, { phase: "running" });
    }
    if (event.kind === "tool_finished") {
      phases.set(event.value.callId, { output: event.value.output, phase: "completed" });
    }
  }
  for (const callId of outputs.keys()) {
    const output = outputs.get(callId);
    if (!output) {
      throw new Error(`工具输出快照不存在：${callId}`);
    }
    phases.set(callId, { output, phase: "completed" });
  }
  return phases;
}
export function streamTimelineMessages(
  events: DisplayEvent[],
  outputs: Map<string, DisplayToolOutput>,
  lifecycle: ReturnType<typeof toolCallLifecycle>,
  fileLinks: FileLinkUnit[] = [],
): TimelineMessage[] {
  const messages = new Map<string, StreamMessage>();
  for (const event of events) {
    if (isPartEvent(event)) {
      let message = messages.get(event.messageId);
      if (!message) {
        message = {
          contentLength: 0,
          firstEventId: event.id,
          messageId: event.messageId,
          order: [],
          parts: new Map(),
          reasoningLength: 0,
        };
        messages.set(event.messageId, message);
      }
      const part = message.parts.get(event.partId);
      if (part) {
        mergeStreamPart(part, event, message);
      } else {
        message.parts.set(event.partId, createStreamPart(event, message));
        message.order.push(event.partId);
      }
    }
  }
  reconcileToolStreams(messages.values(), events);
  return [...messages.values()].map((message) =>
    projectStreamMessage(message, outputs, lifecycle, fileLinks),
  );
}
function isPartEvent(
  event: DisplayEvent,
): event is Exclude<DisplayEvent, { kind: "tool_finished" | "tool_started" | "user_appended" }> {
  return (
    event.kind !== "tool_finished" &&
    event.kind !== "tool_started" &&
    event.kind !== "user_appended"
  );
}
