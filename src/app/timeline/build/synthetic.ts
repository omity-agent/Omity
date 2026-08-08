import type { DisplayRole, TimelineMessage } from "../types";

export function syntheticMessage(role: DisplayRole, content: string, key: string): TimelineMessage {
  return {
    content,
    createdAt: 0,
    id: -1,
    key,
    parts: content.trim() ? [{ content, type: "content" }] : [],
    role,
  };
}
