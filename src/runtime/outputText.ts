import type { ContentBlock, MessageContent } from "@langchain/core/messages";
import { isPlainObject as isRecord } from "es-toolkit";

interface ToolTextContent {
  text: string;
  isError: boolean;
  normalized: MessageContent;
  replaceText: (replacement: string) => MessageContent;
}
export function inspectToolTextContent(content: unknown): ToolTextContent | null {
  const parsed = parseMcpContent(content);
  if (parsed === null) {
    return null;
  }
  const { value } = parsed;
  if (typeof value === "string") {
    return {
      isError: parsed.isError,
      normalized: value,
      replaceText: (replacement) => replacement,
      text: value,
    };
  }
  const text = value.map(blockText).join(""),
    hasNonText = value.some((block) => blockText(block) === null);
  return {
    isError: parsed.isError,
    normalized: hasNonText ? value : text,
    replaceText: (replacement) =>
      hasNonText ? replaceTextBlocks(value, replacement) : replacement,
    text,
  };
}
function parseMcpContent(
  content: unknown,
): { value: string | ContentBlock[]; isError: boolean } | null {
  if (isContentBlockArray(content)) {
    return { isError: false, value: content };
  }
  if (typeof content !== "string") {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    return { isError: false, value: content };
  }
  if (isContentBlockArray(parsed)) {
    return { isError: false, value: parsed };
  }
  if (isRecord(parsed) && isContentBlockArray(parsed["content"])) {
    return { isError: parsed["isError"] === true, value: parsed["content"] };
  }
  if (isTextBlock(parsed)) {
    return { isError: false, value: [parsed] };
  }
  return { isError: false, value: content };
}
function replaceTextBlocks(blocks: ContentBlock[], replacement: string): MessageContent {
  const firstText = blocks.findIndex((block) => blockText(block) !== null);
  if (firstText === -1) {
    return [{ text: replacement, type: "text" }, ...blocks];
  }
  return blocks.flatMap((block, index) => {
    if (blockText(block) === null) {
      return [block];
    }
    return index === firstText ? [{ text: replacement, type: "text" }] : [];
  });
}
function blockText(block: ContentBlock): string | null {
  return isTextBlock(block) ? block.text : null;
}
function isTextBlock(
  value: unknown,
): value is ContentBlock & { text: string; type: "input_text" | "text" } {
  return (
    isRecord(value) &&
    (value["type"] === "text" || value["type"] === "input_text") &&
    typeof value["text"] === "string"
  );
}
export function isContentBlockArray(value: unknown): value is ContentBlock[] {
  return Array.isArray(value) && value.every(isContentBlock);
}
function isContentBlock(value: unknown): value is ContentBlock {
  return isRecord(value) && typeof value["type"] === "string";
}
