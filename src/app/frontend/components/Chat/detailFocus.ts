import type { TimelineMessage } from "../../../timeline";

export function findLatestDetail(view: TimelineMessage[]) {
  for (let messageIndex = view.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const item = view[messageIndex],
      partIndex = (item?.parts.length ?? 0) - 1,
      part = item?.parts[partIndex];
    if (part) {
      return part.type === "content" ? undefined : { messageKey: item.key, partIndex };
    }
  }
  return undefined;
}
