import type { BaseMessage } from "@langchain/core/messages";
import { contentToText } from "./content";

export function messageContentParts(message: BaseMessage) {
  const stored = message.additional_kwargs["aiSdkContent"],
    parts = modelTextParts(stored ?? message.content);
  return parts.length > 0 ? parts : modelTextParts(message.content);
}
export function messageContentToText(message: BaseMessage) {
  const stored = message.additional_kwargs["aiSdkContent"];
  return modelContentToText(stored ?? message.content);
}
function modelContentToText(content: unknown) {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return contentToText(content);
  }
  let current = "",
    previous = "";
  for (const part of content) {
    const text = modelTextPart(part);
    if (text === undefined) {
      previous = current || previous;
      current = "";
    } else {
      current += text;
    }
  }
  return current || previous;
}
function modelTextParts(content: unknown) {
  if (typeof content === "string") {
    return [content];
  }
  if (!Array.isArray(content)) {
    const text = contentToText(content);
    return text ? [text] : [];
  }
  return content.flatMap((part) => {
    const text = modelTextPart(part);
    return text === undefined ? [] : [text];
  });
}
function modelTextPart(part: unknown) {
  if (typeof part === "string") {
    return part;
  }
  return typeof part === "object" &&
    part !== null &&
    "type" in part &&
    part.type === "text" &&
    "text" in part &&
    typeof part.text === "string"
    ? part.text
    : undefined;
}
