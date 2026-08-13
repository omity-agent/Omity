import type { TimelineMessage } from "../../../timeline";
import { createShortId } from "../../../../infrastructure/randomId";

export interface OptimisticUser {
  content: string;
  createdAt: number;
  key: string;
  sessionId: string;
  submissionId: string;
}
export function createOptimisticUser(sessionId: string, content: string): OptimisticUser {
  return {
    content,
    createdAt: Date.now(),
    key: `optimistic-${createShortId()}`,
    sessionId,
    submissionId: createShortId(),
  };
}
export function optimisticTimelineMessage(user: OptimisticUser): TimelineMessage {
  return {
    content: user.content,
    createdAt: user.createdAt,
    id: -1,
    key: user.key,
    optimistic: true,
    parts: [{ content: user.content, type: "content" }],
    role: "user",
  };
}
