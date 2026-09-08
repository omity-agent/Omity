import type { TimelineMessage } from "../../../../timeline";
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
  range: { first: number; last: number },
  spans: Map<string, MessageSpan>,
) {
  return [...spans.values()].filter(
    (span) =>
      span.message.role === "assistant" && span.first <= range.last && span.last >= range.first,
  );
}
