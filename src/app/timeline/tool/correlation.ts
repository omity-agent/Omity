import type { DisplayEvent, DisplayToolCall } from "../types";

interface StreamIdentityPart {
  formal?: true;
  id?: string;
  index?: number;
  kind: string;
}
interface StreamIdentityMessage {
  messageId: string;
  parts: Map<string, StreamIdentityPart>;
}
export function reconcileToolStreams(
  messages: Iterable<StreamIdentityMessage>,
  events: DisplayEvent[],
) {
  const byMessage = new Map([...messages].map((message) => [message.messageId, message]));
  for (const event of events) {
    if (event.kind === "tool_started") {
      const part = byMessage.get(event.messageId)?.parts.get(event.partId);
      if (part?.kind !== "tool_call_delta") {
        throw new Error(`工具开始事件缺少流身份：${streamCallKey(event.messageId, event.partId)}`);
      }
      if (part.id && !event.value.startsWith(part.id)) {
        throw new Error(`工具流身份绑定了不同的正式调用 ID：${part.id}、${event.value}`);
      }
      part.id = event.value;
      part.formal = true;
    }
  }
  validateFormalCallIds(byMessage.values());
}
export function sameToolCall(a: DisplayToolCall, b: DisplayToolCall) {
  const samePosition =
    a.messageId !== undefined && a.messageId === b.messageId && a.index === b.index;
  const bothFormal = !a.temporary && !b.temporary;
  if (bothFormal) {
    if (samePosition && a.id !== b.id) {
      throw new Error(`工具流身份绑定了不同的正式调用 ID：${a.id}、${b.id}`);
    }
    if (
      a.id === b.id &&
      !samePosition &&
      a.messageId &&
      b.messageId &&
      (a.inputText === undefined) === (b.inputText === undefined)
    ) {
      throw new Error(`正式工具调用 ID ${a.id} 绑定了多个流身份`);
    }
  }
  if (a.id === b.id && (!a.temporary || !b.temporary)) {
    return true;
  }
  return samePosition;
}
function validateFormalCallIds(messages: Iterable<StreamIdentityMessage>) {
  const owners = new Map<string, string>();
  for (const message of messages) {
    for (const [partId, part] of message.parts) {
      if (part.kind === "tool_call_delta" && part.formal && part.id) {
        const owner = streamCallKey(message.messageId, partId);
        const existing = owners.get(part.id);
        if (existing && existing !== owner) {
          throw new Error(`正式工具调用 ID ${part.id} 绑定了多个流身份`);
        }
        owners.set(part.id, owner);
      }
    }
  }
}
export function streamCallKey(messageId: string, partId: string) {
  return `stream:${messageId}:${partId}`;
}
export function displayToolCallKey(call: DisplayToolCall) {
  return call.messageId
    ? `message:${call.messageId}:index:${call.index.toString()}`
    : `call:${call.id}`;
}
