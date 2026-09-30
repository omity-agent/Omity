import { Output, generateText } from "ai";
import { discoverySettings, wireModel } from "./wireFixtures";
import { expect, test } from "bun:test";
import { HumanMessage } from "@langchain/core/messages";
import { aiModelTools } from "../../../src/agent/model/tools";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { streamAiModel } from "../../../src/agent/model/request";
import { structuredRequestOptions } from "../../../src/agent/model/provider";
import { z } from "zod";

test.each(["completions", "responses", "messages"] as const)(
  "%s explicitly disables tools for empty main and structured requests",
  async (api) => {
    await using wire = wireModel(api);
    const settings = discoverySettings(api);
    expect(
      streamAiModel({
        messages: [new HumanMessage("Reply without tools")],
        model: wire.model,
        sessionId: "empty-tools",
        settings,
        tools: {},
      }),
    ).rejects.toThrow("request captured");
    expect(
      generateText({
        ...structuredRequestOptions(settings.model),
        maxRetries: 0,
        model: wire.model,
        output: Output.object({ schema: z.object({ reply: z.string() }) }),
        prompt: "Predict a reply",
      }),
    ).rejects.toThrow("request captured");
    expect(wire.requests).toHaveLength(2);
    for (const request of wire.requests) {
      expect(request).toMatchObject({
        tool_choice: api === "messages" ? { type: "none" } : "none",
        tools: [],
      });
    }
  },
);
test.each(["completions", "responses", "messages"] as const)(
  "%s preserves application functions even when named like built-in tools",
  async (api) => {
    await using wire = wireModel(api);
    expect(
      streamAiModel({
        messages: [new HumanMessage("Use the application tool")],
        model: wire.model,
        sessionId: "application-tools",
        settings: discoverySettings(api),
        tools: aiModelTools(
          [
            {
              description: "Local search",
              freeform: false,
              inputSchema: { type: "object" },
              name: "web_search",
            },
          ],
          api,
        ),
      }),
    ).rejects.toThrow("request captured");
    expect(wire.requests[0]?.["tools"]).toHaveLength(1);
    expect(wire.requests[0]?.["tool_choice"]).toEqual(
      api === "messages" ? { type: "auto" } : "auto",
    );
  },
);
test.each(["responses", "messages"] as const)(
  "%s rejects built-in web search before sending a request",
  async (api) => {
    await using wire = wireModel(api);
    expect(
      streamAiModel({
        messages: [new HumanMessage("Search")],
        model: wire.model,
        sessionId: "blocked-tools",
        settings: discoverySettings(api),
        tools: {
          search:
            api === "responses"
              ? openai.tools.webSearch({})
              : anthropic.tools.webSearch_20250305({}),
        },
      }),
    ).rejects.toThrow("供应商内置工具已禁用");
    expect(wire.requests).toHaveLength(0);
  },
);
test("Responses preserves application free-form tools", async () => {
  await using wire = wireModel("responses");
  expect(
    streamAiModel({
      messages: [new HumanMessage("Run a local command")],
      model: wire.model,
      sessionId: "custom-tools",
      settings: discoverySettings("responses"),
      tools: aiModelTools(
        [
          {
            description: "Local command",
            freeform: true,
            inputSchema: { type: "object" },
            name: "shell",
          },
        ],
        "responses",
      ),
    }),
  ).rejects.toThrow("request captured");
  expect(wire.requests[0]?.["tools"]).toEqual([
    expect.objectContaining({ name: "shell", type: "custom" }),
  ]);
});
