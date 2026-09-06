import type { TimelineMessage } from "../../../timeline";

interface TranscriptSegment {
  key: string;
  message: TimelineMessage;
  partIndex?: number;
}
export function segmentTranscript(messages: TimelineMessage[]): TranscriptSegment[] {
  return messages.flatMap((message) => {
    if (message.role === "user" || message.role === "system" || message.parts.length === 0) {
      return [{ key: message.key, message }];
    }
    return message.parts.map((part, partIndex) => ({
      key: `${message.key}:${part.type}:${part.type === "tool" ? part.key : partIndex.toString()}`,
      message,
      partIndex,
    }));
  });
}
