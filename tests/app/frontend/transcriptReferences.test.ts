import {
  type TranscriptSnapshot,
  appendTranscriptEvents,
  reconcileTranscript,
} from "../../../src/app/frontend/services/transcript/cache";
import { expect, test } from "bun:test";
import type { DisplayEvent } from "../../../src/app/timeline";

test("preserves unchanged timeline object references while appending a delta", () => {
  const snapshot: TranscriptSnapshot = {
      control: "running",
      eventCursor: 0,
      events: [],
      fileLinks: [],
      messages: [
        {
          content: "question",
          createdAt: 1,
          id: 1,
          images: [],
          queueId: 1,
          reasoning: "",
          role: "user",
          toolCalls: [],
        },
      ],
      queue: [
        {
          content: "question",
          error: null,
          id: 1,
          status: "running",
          userMessageId: 1,
        },
      ],
      reasoningTranslations: [],
      transcriptRevision: 0,
    },
    current = reconcileTranscript(snapshot),
    [firstMessage] = current.view,
    event: DisplayEvent = {
      id: 1,
      kind: "assistant_text_delta",
      messageId: "message-1",
      partId: "text-1",
      queueId: 1,
      value: "answer",
    },
    next = appendTranscriptEvents(current, [event]);
  expect(next.view[0]).toBe(firstMessage);
  expect(next.view.at(-1)?.content).toBe("answer");
});
