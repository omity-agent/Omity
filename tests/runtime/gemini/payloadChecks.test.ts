import { Output, generateText } from "ai";
import { echoDefinition, geminiApis, geminiWire } from "./endpointFixture";
import { expect, test } from "bun:test";
import { replyStream, structuredReply } from "./exchangeSamples";
import { HumanMessage } from "@langchain/core/messages";
import { aiModelTools } from "../../../src/agent/model/tools";
import { google } from "@ai-sdk/google";
import { streamAiModel } from "../../../src/agent/model/request";
import { structuredRequestOptions } from "../../../src/agent/model/provider";
import { z } from "zod";

test.each([...geminiApis])(
  "%s supports tool-free streaming and structured prediction",
  async (api) => {
    await using wire = geminiWire(api, [replyStream(api), structuredReply(api)]);
    const response = await streamAiModel({
        messages: [new HumanMessage("Reply without tools")],
        sessionId: "no-tools",
        settings: wire.settings,
        tools: {},
      }),
      prediction = await generateText({
        ...structuredRequestOptions(wire.settings.model),
        maxRetries: 0,
        model: wire.model,
        output: Output.object({ schema: z.object({ reply: z.string() }) }),
        prompt: "Predict a reply",
      });
    expect(response.text).toBe("Finished");
    expect(prediction.output).toEqual({ reply: "predicted" });
    expect(wire.requests).toHaveLength(2);
    for (const { body, headers } of wire.requests) {
      expect(headers.get("x-goog-api-key")).toBe("gemini-test-key");
      expect(body).not.toHaveProperty("tools");
      expect(body).not.toHaveProperty("tool_choice");
      if (api === "interactions") {
        expect(body).toMatchObject({ generation_config: { thinking_level: "high" }, store: false });
        expect(body["generation_config"]).not.toHaveProperty("tool_choice");
      } else {
        expect(body).not.toHaveProperty("toolConfig");
      }
    }
    const body = wire.requests[1]?.body;
    expect(body).toMatchObject(
      api === "interactions"
        ? {
            response_format: [
              { mime_type: "application/json", schema: expect.any(Object), type: "text" },
            ],
          }
        : {
            generationConfig: {
              responseJsonSchema: expect.any(Object),
              responseMimeType: "application/json",
            },
          },
    );
  },
);
test.each([...geminiApis])(
  "%s surfaces HTTP errors without executing application tools",
  async (api) => {
    await using wire = geminiWire(api);
    expect(
      streamAiModel({
        messages: [new HumanMessage("Echo hello")],
        sessionId: "http-error",
        settings: wire.settings,
        tools: aiModelTools([echoDefinition], api),
      }),
    ).rejects.toThrow("request captured");
    expect(wire.requests).toHaveLength(1);
  },
);
test.each([...geminiApis])("%s rejects built-in tools before sending requests", async (api) => {
  await using wire = geminiWire(api);
  for (const tool of [
    google.tools.googleSearch({}),
    google.tools.codeExecution({}),
    google.tools.urlContext({}),
  ]) {
    expect(
      streamAiModel({
        messages: [new HumanMessage("Use a built-in tool")],
        sessionId: "blocked-tool",
        settings: wire.settings,
        tools: { built_in: tool },
      }),
    ).rejects.toThrow("供应商内置工具已禁用");
  }
  expect(wire.requests).toHaveLength(0);
});
test.each(["none", "xhigh", "max"] as const)(
  "Interactions rejects unsupported reasoning effort %s",
  async (reasoning_effort) => {
    await using wire = geminiWire("interactions");
    wire.settings.model.reasoning_effort = reasoning_effort;
    expect(
      streamAiModel({
        messages: [new HumanMessage("Think")],
        sessionId: "unsupported-reasoning",
        settings: wire.settings,
        tools: {},
      }),
    ).rejects.toThrow("Gemini Interactions API 不支持 reasoning_effort");
    expect(wire.requests).toHaveLength(0);
  },
);
test("Generate Content maps reasoning to a budget for Gemini 2.5", async () => {
  await using wire = geminiWire("generate-content");
  wire.settings.model.model = "gemini-2.5-flash";
  expect(
    streamAiModel({
      messages: [new HumanMessage("Think")],
      sessionId: "budget",
      settings: wire.settings,
      tools: {},
    }),
  ).rejects.toThrow("request captured");
  expect(wire.requests[0]?.body).toMatchObject({
    generationConfig: {
      thinkingConfig: { includeThoughts: true, thinkingBudget: expect.any(Number) },
    },
  });
  expect(wire.requests[0]?.body["generationConfig"]).not.toHaveProperty(
    "thinkingConfig.thinkingLevel",
  );
});
