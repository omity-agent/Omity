import type { TimelineMessage, TimelinePart } from "../../../timeline";

interface DetailFocus {
  messageKey: string;
  partIndex: number;
}
type DetailType = Exclude<TimelinePart["type"], "content">;
export function findLatestDetails(view: TimelineMessage[]) {
  const result: Partial<Record<DetailType, DetailFocus>> = {};
  for (let messageIndex = view.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const item = view[messageIndex];
    if (item) {
      for (let partIndex = item.parts.length - 1; partIndex >= 0; partIndex -= 1) {
        const part = item.parts[partIndex];
        if (!part || part.type === "content") {
          return result;
        }
        result[part.type] ??= { messageKey: item.key, partIndex };
        if (result.reasoning && result.tool) {
          return result;
        }
      }
    }
  }
  return result;
}
