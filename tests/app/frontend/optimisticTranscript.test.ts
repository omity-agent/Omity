import { type TranscriptData, transcriptKey } from "../../../src/app/frontend/services/queries";
import {
  appendTranscriptEvents,
  emptyTranscriptData,
  rebuildTranscript,
} from "../../../src/app/frontend/services/transcript/cache";
import {
  createOptimisticUser,
  optimisticTimelineMessage,
} from "../../../src/app/frontend/services/transcript/optimistic";
import { expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

test("optimistic user has a stable timeline representation", () => {
  const user = createOptimisticUser("session", "hello");
  expect(optimisticTimelineMessage(user)).toMatchObject({
    content: "hello",
    key: user.key,
    optimistic: true,
    parts: [{ content: "hello" }],
    role: "user",
  });
});
test("rebuilding after confirmation does not duplicate a persisted user", () => {
  const client = new QueryClient();
  client.setQueryData<TranscriptData>(transcriptKey("session"), empty());
  client.setQueryData<TranscriptData>(transcriptKey("session"), (current) =>
    rebuildTranscript(current ?? empty(), {
      messages: [
        {
          content: "hello",
          createdAt: 1,
          id: 11,
          images: [],
          queueId: 7,
          reasoning: "",
          role: "user",
          sourceId: "human-11",
          toolCalls: [],
        },
      ],
      queue: [
        {
          content: "",
          error: null,
          id: 7,
          status: "running",
          userMessageId: 11,
        },
      ],
    }),
  );
  expect(transcript(client).view.map(({ key: itemKey }) => itemKey)).toEqual(["message-11"]);
});
test("stream deltas do not move a staged user boundary into transcript cache", () => {
  const client = new QueryClient();
  client.setQueryData<TranscriptData>(transcriptKey("session"), {
    ...empty(),
    eventCursor: 1,
    events: [
      {
        id: 1,
        kind: "assistant_text_delta",
        messageId: "before",
        partId: "text-1",
        queueId: 1,
        value: "before",
      },
    ],
    queue: [
      {
        content: "",
        error: null,
        id: 1,
        status: "running",
        userMessageId: 1,
      },
    ],
  });
  client.setQueryData<TranscriptData>(transcriptKey("session"), (current) =>
    appendTranscriptEvents(current ?? empty(), [
      {
        id: 2,
        kind: "assistant_text_delta",
        messageId: "after",
        partId: "text-1",
        queueId: 1,
        value: "after",
      },
    ]),
  );
  expect(transcript(client).view.map(({ content, role }) => `${role}:${content}`)).toEqual([
    "assistant:before\n\nafter",
  ]);
});
test("pending queue acknowledgement does not turn the stale client cursor into a boundary", () => {
  const client = new QueryClient();
  client.setQueryData<TranscriptData>(transcriptKey("session"), {
    ...empty(),
    eventCursor: 1,
    events: [
      {
        id: 1,
        kind: "assistant_text_delta",
        messageId: "before",
        partId: "text-1",
        queueId: 1,
        value: "before",
      },
    ],
    queue: [
      {
        content: "",
        error: null,
        id: 1,
        status: "running",
        userMessageId: 1,
      },
    ],
  });
  client.setQueryData<TranscriptData>(transcriptKey("session"), (current) =>
    rebuildTranscript(current ?? empty(), {
      queue: [
        ...(current?.queue ?? []),
        {
          content: "hello",
          error: null,
          id: 2,
          status: "pending",
          userMessageId: null,
        },
      ],
    }),
  );
  client.setQueryData<TranscriptData>(transcriptKey("session"), (current) =>
    appendTranscriptEvents(current ?? empty(), [
      {
        id: 2,
        kind: "assistant_text_delta",
        messageId: "after",
        partId: "text-1",
        queueId: 1,
        value: "after",
      },
    ]),
  );
  expect(transcript(client).view.map(({ content, role }) => `${role}:${content}`)).toEqual([
    "assistant:before\n\nafter",
    "user:hello",
  ]);
});
function transcript(client: QueryClient) {
  const data = client.getQueryData<TranscriptData>(transcriptKey("session"));
  if (!data) {
    throw new Error("transcript cache missing");
  }
  return data;
}
function empty(): TranscriptData {
  return emptyTranscriptData();
}
