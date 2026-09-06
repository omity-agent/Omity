import type { TimelineMessage } from "../../../../timeline";
import type { VirtualItem } from "@tanstack/react-virtual";
import type { segmentTranscript } from "../segments";

export interface MessageSpan {
  first: number;
  last: number;
  message: TimelineMessage;
}
export function messageSpans(segments: ReturnType<typeof segmentTranscript>) {
  const spans = new Map<string, MessageSpan>();
  for (const [index, segment] of segments.entries()) {
    const current = spans.get(segment.message.key);
    if (current) {
      current.last = index;
    } else {
      spans.set(segment.message.key, { first: index, last: index, message: segment.message });
    }
  }
  return spans;
}
export function visibleCopies(
  items: VirtualItem[],
  segments: ReturnType<typeof segmentTranscript>,
  spans: Map<string, MessageSpan>,
) {
  const keys = new Set(items.map((item) => segments[item.index]!.message.key));
  return [...keys].flatMap((key) => {
    const span = spans.get(key);
    return span?.message.role === "assistant" ? [span] : [];
  });
}
