import type { TimelinePart } from "./contracts/projection";

export function lastContentGroup(parts: readonly TimelinePart[]) {
  const content: string[] = [];
  for (const part of parts.toReversed()) {
    if (part.type === "content") {
      content.unshift(part.content);
    } else if (content.length > 0) {
      break;
    }
  }
  return content.join("");
}
export function allContent(parts: readonly TimelinePart[]) {
  return parts.flatMap((part) => (part.type === "content" ? [part.content] : [])).join("");
}
