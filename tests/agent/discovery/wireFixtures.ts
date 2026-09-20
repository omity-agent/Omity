import type { ModelApi, Settings } from "../../../src/types";
import type { ModelToolDefinition } from "../../../src/infrastructure/mcp/tools/definitions";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { isPlainObject } from "es-toolkit";
import { testSettings } from "../../support/settings";

export const deferredDefinition: ModelToolDefinition = {
  deferLoading: true,
  description: "Find a file",
  freeform: false,
  inputSchema: { properties: { query: { type: "string" } }, required: ["query"], type: "object" },
  name: "find_file",
};
export function discoverySettings(api: ModelApi): Settings {
  const settings = testSettings();
  settings.model = {
    ...settings.model,
    adapter: api,
    apiKeyEnv: "TEST_KEY",
    baseURL: null,
    model: api === "messages" ? "claude-sonnet-4-6" : "gpt-5.4",
    reasoning_effort: api === "responses" ? "high" : undefined,
    temperature: undefined,
  };
  return settings;
}
export function wireModel(api: ModelApi, events: Record<string, unknown>[] = []) {
  const requests: Record<string, unknown>[] = [],
    captureFetch = Object.assign(
      async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        if (typeof init?.body !== "string") {
          throw new Error("Missing request body");
        }
        const body: unknown = JSON.parse(init.body);
        if (!isPlainObject(body)) {
          throw new Error("Invalid request body");
        }
        requests.push(body);
        return requests.length === 1 && events.length > 0
          ? new Response(
              events
                .map(
                  (event) => `event: ${String(event["type"])}\ndata: ${JSON.stringify(event)}\n\n`,
                )
                .join(""),
              { headers: { "Content-Type": "text/event-stream" } },
            )
          : Response.json(
              {
                error: { message: "request captured", type: "invalid_request_error" },
                type: "error",
              },
              { status: 400 },
            );
      },
      { preconnect: fetch.preconnect },
    ),
    options = { apiKey: "test", fetch: captureFetch },
    model =
      api === "messages"
        ? createAnthropic(options)("claude-sonnet-4-6")
        : createOpenAI(options).responses("gpt-5.4");
  return { model, requests };
}
export function responsesSearchEvents() {
  const search = {
      arguments: { paths: ["find_file"] },
      call_id: null,
      execution: "server",
      id: "search-1",
      status: "completed",
      type: "tool_search_call",
    },
    output = {
      call_id: null,
      execution: "server",
      id: "search-output-1",
      status: "completed",
      tools: [
        {
          defer_loading: true,
          name: "find_file",
          parameters: deferredDefinition.inputSchema,
          type: "function",
        },
      ],
      type: "tool_search_output",
    },
    call = {
      arguments: '{"query":"file"}',
      call_id: "call-1",
      id: "function-1",
      name: "find_file",
      status: "completed",
      type: "function_call",
    };
  return [
    { response: { created_at: 1, id: "response-1", model: "gpt-5.4" }, type: "response.created" },
    ...[search, output, call].flatMap((item, output_index) => [
      { item, output_index, type: "response.output_item.added" },
      { item, output_index, type: "response.output_item.done" },
    ]),
    { response: { usage: { input_tokens: 10, output_tokens: 10 } }, type: "response.completed" },
  ];
}
export function messagesSearchEvents(pause = false) {
  const blocks = [
    { id: "search-1", input: {}, name: "tool_search_tool_regex", type: "server_tool_use" },
    {
      content: {
        tool_references: [{ tool_name: "find_file", type: "tool_reference" }],
        type: "tool_search_tool_search_result",
      },
      tool_use_id: "search-1",
      type: "tool_search_tool_result",
    },
    ...(!pause ? [{ id: "call-1", input: {}, name: "find_file", type: "tool_use" }] : []),
  ];
  return [
    {
      message: {
        id: "response-1",
        model: "claude-sonnet-4-6",
        role: "assistant",
        usage: { input_tokens: 10 },
      },
      type: "message_start",
    },
    ...blocks.flatMap((content_block, index) => {
      const events: Record<string, unknown>[] = [
        { content_block, index, type: "content_block_start" },
      ];
      if (index !== 1) {
        events.push({
          delta: {
            partial_json: index === 0 ? '{"pattern":"file"}' : '{"query":"file"}',
            type: "input_json_delta",
          },
          index,
          type: "content_block_delta",
        });
      }
      events.push({ index, type: "content_block_stop" });
      return events;
    }),
    {
      delta: { stop_reason: pause ? "pause_turn" : "tool_use" },
      type: "message_delta",
      usage: { output_tokens: 10 },
    },
    { type: "message_stop" },
  ];
}
