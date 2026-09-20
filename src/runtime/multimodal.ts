import type { ModelApi } from "../types";
import { isPlainObject as isRecord } from "es-toolkit";

interface ToolImage {
  src: string;
  mimeType: string;
}
export function modelToolOutput(content: unknown, api: ModelApi) {
  const images = extractToolImages(content),
    text = toolContentText(content);
  if (images.length === 0) {
    return { type: "text" as const, value: text };
  }
  if (api === "completions") {
    const notice = `工具返回了 ${images.length.toString()} 张图片，但 Completions API 不支持工具返回图片给模型。`;
    return { type: "text" as const, value: [text, notice].filter(Boolean).join("\n\n") };
  }
  return {
    type: "content" as const,
    value: [
      ...(text ? [{ text, type: "text" as const }] : []),
      ...images.map(({ mimeType, src }) => ({
        data: { type: "url" as const, url: new URL(src) },
        mediaType: mimeType,
        type: "file" as const,
      })),
    ],
  };
}
export function extractToolImages(content: unknown): ToolImage[] {
  const parsed = parseStructuredString(content);
  if (parsed !== content) {
    return extractToolImages(parsed);
  }
  if (Array.isArray(content)) {
    return content.flatMap(extractToolImages);
  }
  if (!isRecord(content)) {
    return [];
  }
  if (Array.isArray(content["content"])) {
    return extractToolImages(content["content"]);
  }
  const image = readImage(content);
  return image ? [image] : [];
}
function toolContentText(content: unknown): string {
  const parsed = parseStructuredString(content);
  if (parsed !== content) {
    return toolContentText(parsed);
  }
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map(toolContentText).join("");
  }
  if (content == null) {
    return "";
  }
  if (!isRecord(content)) {
    if (
      typeof content === "number" ||
      typeof content === "boolean" ||
      typeof content === "bigint"
    ) {
      return content.toString();
    }
    throw new Error(`工具消息包含不支持的内容类型：${typeof content}`);
  }
  if (Array.isArray(content["content"])) {
    return toolContentText(content["content"]);
  }
  if (
    (content["type"] === "text" || content["type"] === "input_text") &&
    typeof content["text"] === "string"
  ) {
    return content["text"];
  }
  if (readImage(content)) {
    return "";
  }
  return JSON.stringify(content);
}
function readImage(value: Record<string, unknown>): ToolImage | null {
  if (value["type"] === "image") {
    const { data } = value,
      mimeType = value["mimeType"] ?? value["mime_type"];
    if (typeof data === "string" && typeof mimeType === "string") {
      return { mimeType, src: `data:${mimeType};base64,${data}` };
    }
  }
  if (value["type"] !== "image_url" && value["type"] !== "input_image") {
    return null;
  }
  const raw = value["image_url"],
    src = typeof raw === "string" ? raw : isRecord(raw) ? raw["url"] : null;
  return typeof src === "string" ? parseImageDataUrl(src) : null;
}
function parseImageDataUrl(src: string): ToolImage | null {
  const match = /^data:(?<mimeType>[^;,]+)(?:;[^,]*)*;base64,/i.exec(src);
  return match?.groups?.["mimeType"] ? { mimeType: match.groups["mimeType"], src } : null;
}
function parseStructuredString(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return isStructuredContent(parsed) ? parsed : value;
  } catch {
    return value;
  }
}
function isStructuredContent(value: unknown) {
  return (
    Array.isArray(value) ||
    (isRecord(value) && (Array.isArray(value["content"]) || typeof value["type"] === "string"))
  );
}
