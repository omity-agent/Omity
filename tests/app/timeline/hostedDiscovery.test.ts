import { type AiStreamEvent, streamAiModel } from "../../../src/agent/model/request";
import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, required, workspace } from "../../support/database";
import {
  deferredDefinition,
  discoverySettings,
  messagesSearchEvents,
  responsesSearchEvents,
  wireModel,
} from "../../agent/discovery/wireFixtures";
import { streamTimelineMessages, toolCallLifecycle } from "../../../src/app/timeline/streamEvents";
import { HumanMessage } from "@langchain/core/messages";
import type { StreamEvent } from "../../../src/types";
import { agentFixture } from "../../runtime/support/agentFixture";
import { aiModelTools } from "../../../src/agent/model/tools";
import { buildTimeline } from "../../../src/app/timeline";
import { createStreamLogState } from "../../../src/runtime/stream";
import { loadTranscript } from "../../../src/app/transcript";
import { recordAiStreamPart } from "../../../src/runtime/aiStream";
import { transcriptResponseSchema } from "../../../src/app/timeline/contracts/records";

afterEach(cleanupDatabaseDirs);
test.each(["responses", "messages"] as const)(
  "%s hosted search keeps its input and output visible during streaming and after reload",
  async (api) => {
    const { context, db, executions } = agentFixture(),
      state = createStreamLogState(),
      events: StreamEvent[] = [],
      parts: AiStreamEvent[] = [],
      { model } = wireModel(
        api,
        api === "responses" ? responsesSearchEvents() : messagesSearchEvents(),
      );
    db.resetSession("target", workspace);
    const queueId = db.appendUser("target", "Find a file"),
      user = new HumanMessage({
        content: "Find a file",
        id: `queue:target:${queueId.toString()}`,
      });
    db.startQueue("target", required(db.nextQueue("target")));
    db.onChange((event) => events.push(event));
    try {
      const response = await streamAiModel({
        messages: [user],
        model,
        sessionId: "target",
        settings: discoverySettings(api),
        tools: aiModelTools([deferredDefinition], api),
        write: (part) => parts.push(part),
      });
      for (const part of parts) {
        await recordAiStreamPart(context, queueId, part, state);
        if (part.part.type === "tool-call" && part.part.providerExecuted) {
          expect(streamedTools(events)[0]).toMatchObject({
            call: {
              input: api === "responses" ? { paths: ["find_file"] } : { pattern: "file" },
              providerExecuted: true,
            },
            phase: "running",
          });
        }
      }
      const search = required(streamedTools(events)[0]);
      expect(search).toMatchObject({
        call: {
          id: "search-1",
          input: api === "responses" ? { paths: ["find_file"] } : { pattern: "file" },
          providerExecuted: true,
        },
        phase: "completed",
      });
      expect(search.output?.content).toContain("find_file");
      expect(search.output?.content).not.toContain('{"');
      expect(search.output?.content).toContain(api === "responses" ? "tools:" : "- type:");
      expect(search.output?.outputTokens).toBeGreaterThan(0);
      expect(executions.cancel("search-1")).toBe(false);
      expect(response.tool_calls?.map((call) => call.id)).toEqual(["call-1"]);
      await db.syncHistory("target", [user, response]);
      const transcript = transcriptResponseSchema.parse(loadTranscript(db, "target"));
      for (const persistedEvents of [transcript.events, []]) {
        const tools = buildTimeline(transcript.messages, transcript.queue, persistedEvents)
          .flatMap((message) => message.parts)
          .filter((part) => part.type === "tool");
        expect(tools.map((part) => part.call.id)).toEqual(["search-1", "call-1"]);
        expect(tools[0]).toMatchObject({
          call: { input: search.call.input, providerExecuted: true },
          output: search.output,
          phase: "completed",
        });
        expect(tools[1]).toMatchObject({ phase: "pending" });
        expect(tools[1]?.call.providerExecuted).toBeUndefined();
      }
    } finally {
      db.close();
    }
  },
);
test("hosted search errors complete the visible card without local execution", async () => {
  const { context, db, executions } = agentFixture(),
    state = createStreamLogState(),
    events: StreamEvent[] = [],
    call = {
      input: { pattern: "[" },
      providerExecuted: true,
      toolCallId: "failed-search",
      toolName: "tool_search_tool_regex",
    };
  db.resetSession("target", workspace);
  const queueId = db.appendUser("target", "search");
  db.onChange((event) => events.push(event));
  try {
    for (const part of [
      {
        id: call.toolCallId,
        providerExecuted: true,
        toolName: call.toolName,
        type: "tool-input-start",
      },
      { ...call, type: "tool-call" },
      { ...call, error: new Error("invalid search pattern"), type: "tool-error" },
    ] satisfies AiStreamEvent["part"][]) {
      await recordAiStreamPart(context, queueId, { part }, state);
    }
    expect(streamedTools(events)[0]).toMatchObject({
      call: { providerExecuted: true },
      output: { content: expect.stringContaining("invalid search pattern") },
      phase: "completed",
    });
    expect(executions.cancel(call.toolCallId)).toBe(false);
  } finally {
    db.close();
  }
});
function streamedTools(events: StreamEvent[]) {
  return streamTimelineMessages(events, new Map(), toolCallLifecycle(events, new Map()))
    .flatMap((message) => message.parts)
    .filter((part) => part.type === "tool");
}
