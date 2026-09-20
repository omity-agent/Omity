import { HumanMessage, ToolMessage } from "@langchain/core/messages";
import {
  deferredDefinition,
  discoverySettings,
  messagesSearchEvents,
  responsesSearchEvents,
  wireModel,
} from "./wireFixtures";
import { expect, test } from "bun:test";
import { aiModelTools } from "../../../src/agent/model/tools";
import { decodeMessage } from "../../../src/infrastructure/database/records/messages/hydration";
import { encodeMessage } from "../../../src/infrastructure/database/records/messages/payload";
import { streamAiModel } from "../../../src/agent/model/request";
import { toModelMessages } from "../../../src/agent/aiMessages";

test.each(["responses", "messages"] as const)(
  "%s streams hosted discovery and replays it after persistence without local search execution",
  async (api) => {
    const { model, requests } = wireModel(
        api,
        api === "responses" ? responsesSearchEvents() : messagesSearchEvents(),
      ),
      tools = aiModelTools([deferredDefinition], api),
      options = { model, sessionId: "discovery", settings: discoverySettings(api), tools },
      response = await streamAiModel({ ...options, messages: [new HumanMessage("Find a file")] });
    expect(response.tool_calls).toMatchObject([
      { args: { query: "file" }, id: "call-1", name: "find_file" },
    ]);
    expect(response.tool_calls).toHaveLength(1);
    const restored = decodeMessage(JSON.stringify(encodeMessage(response, "history")));
    expect(toModelMessages([restored], api)).toEqual(toModelMessages([response], api));
    expect(
      streamAiModel({
        ...options,
        messages: [
          new HumanMessage("Find a file"),
          restored,
          new ToolMessage({ content: "found", name: "find_file", tool_call_id: "call-1" }),
        ],
      }),
    ).rejects.toThrow("request captured");
    expect(requests).toHaveLength(2);
    if (api === "responses") {
      expect(requests[0]?.["tools"]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ defer_loading: true, name: "find_file", type: "function" }),
          { execution: "server", type: "tool_search" },
        ]),
      );
      expect(requests[1]?.["input"]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            arguments: { paths: ["find_file"] },
            execution: "server",
            type: "tool_search_call",
          }),
          expect.objectContaining({
            execution: "server",
            tools: expect.any(Array),
            type: "tool_search_output",
          }),
          expect.objectContaining({
            call_id: "call-1",
            output: "found",
            type: "function_call_output",
          }),
        ]),
      );
    } else {
      expect(requests[0]).toMatchObject({
        system: [{ text: "test", type: "text" }],
        tools: [
          { defer_loading: true, name: "find_file" },
          { name: "tool_search_tool_regex", type: "tool_search_tool_regex_20251119" },
        ],
      });
      expect(requests[1]?.["messages"]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            content: [
              expect.objectContaining({
                id: "search-1",
                input: { pattern: "file" },
                type: "server_tool_use",
              }),
              expect.objectContaining({
                content: {
                  tool_references: [{ tool_name: "find_file", type: "tool_reference" }],
                  type: "tool_search_tool_search_result",
                },
                tool_use_id: "search-1",
                type: "tool_search_tool_result",
              }),
              expect.objectContaining({ id: "call-1", type: "tool_use" }),
            ],
            role: "assistant",
          }),
        ]),
      );
    }
  },
);
test("Messages pause_turn retains hosted search without inventing a local tool call", async () => {
  const { model } = wireModel("messages", messagesSearchEvents(true)),
    response = await streamAiModel({
      messages: [new HumanMessage("Find a file")],
      model,
      sessionId: "paused-search",
      settings: discoverySettings("messages"),
      tools: aiModelTools([deferredDefinition], "messages"),
    });
  expect(response.tool_calls).toEqual([]);
  expect(response.response_metadata["rawFinishReason"]).toBe("pause_turn");
  expect(response.additional_kwargs["aiSdkContent"]).toHaveLength(2);
});
