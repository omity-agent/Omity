import { expect, test } from "bun:test";

import { HumanMessage } from "@langchain/core/messages";

import { streamAiModel } from "../../../src/agent/model/request";
import { aiModelTools } from "../../../src/agent/model/tools";
import { geminiApis, geminiWire } from "../gemini/endpointFixture";
import { parameterCases, schemaBoundaries } from "./parameterCases";
import { discoverySettings, wireModel } from "./wireFixtures";

test("Messages disables strict for unsupported regular-expression features", async () => {
  await using wire = wireModel("messages");
  expect(
    streamAiModel({
      messages: [new HumanMessage("Use a tool")],
      model: wire.model,
      sessionId: "strict-patterns",
      settings: discoverySettings("messages"),
      tools: aiModelTools(
        ["a(?=b)", "(?<=a)b", String.raw`(a)\1`, String.raw`\bword\b`].map((pattern, i) => ({
          description: "Pattern",
          freeform: false,
          inputSchema: {
            additionalProperties: false,
            properties: { text: { pattern, type: "string" } },
            required: ["text"],
            type: "object",
          },
          name: `pattern_${i}`,
        })),
        "messages",
      ),
    }),
  ).rejects.toThrow("request captured");
  expect(wire.requests[0]?.["tools"]).toMatchObject(
    Array.from({ length: 4 }, () => ({ strict: false })),
  );
});
test.each(["completions", "responses", "messages"] as const)(
  "%s enables strict only for eligible schemas without rewriting parameters",
  async (api) => {
    await using wire = wireModel(api);
    const definitions = parameterCases.map(({ name, schema }) => ({
        description: name,
        freeform: false,
        inputSchema: schema,
        name,
      })),
      before = JSON.stringify(definitions);
    expect(
      streamAiModel({
        messages: [new HumanMessage("Use a tool")],
        model: wire.model,
        sessionId: "strict-schemas",
        settings: discoverySettings(api),
        tools: aiModelTools(definitions, api),
      }),
    ).rejects.toThrow("request captured");
    expect(wire.requests).toHaveLength(1);
    expect(wire.requests[0]?.["tools"]).toEqual(
      parameterCases.map(({ eligible, name, schema }) => {
        const definition = {
          description: name,
          name,
          strict: eligible[api === "messages" ? 1 : 0],
        };
        return api === "completions"
          ? { function: { ...definition, parameters: schema }, type: "function" }
          : expect.objectContaining({
              ...definition,
              [api === "messages" ? "input_schema" : "parameters"]: schema,
            });
      }),
    );
    expect(JSON.stringify(definitions)).toBe(before);
  },
);
test.each([...geminiApis])(
  "%s validates the complete tool group only when every schema is eligible",
  async (api) => {
    await using wire = geminiWire(api);
    for (const mixed of [false, true]) {
      const definitions = parameterCases
          .filter(({ eligible }) => mixed || eligible[2])
          .map(({ name, schema }) => ({
            description: name,
            freeform: false,
            inputSchema: schema,
            name,
          })),
        tools = aiModelTools(definitions, api);
      expect(Object.values(tools).every((tool) => tool.strict === !mixed)).toBe(true);
      expect(
        streamAiModel({
          messages: [new HumanMessage("Use a tool")],
          sessionId: "strict-group",
          settings: wire.settings,
          tools,
        }),
      ).rejects.toThrow("request captured");
      const body = wire.requests.at(-1)?.body;
      expect(body).toMatchObject(
        api === "interactions"
          ? { generation_config: { tool_choice: mixed ? "auto" : "validated" } }
          : { toolConfig: { functionCallingConfig: { mode: mixed ? "AUTO" : "VALIDATED" } } },
      );
    }
    expect(wire.requests).toHaveLength(2);
  },
);
test.each(schemaBoundaries)("Responses checks the strict $name boundary", async ({ schemas }) => {
  await using wire = wireModel("responses");
  expect(
    streamAiModel({
      messages: [new HumanMessage("Use a tool")],
      model: wire.model,
      sessionId: "strict-boundary",
      settings: discoverySettings("responses"),
      tools: aiModelTools(
        schemas.map((inputSchema, i) => ({
          description: "Boundary",
          freeform: false,
          inputSchema,
          name: `boundary_${i}`,
        })),
        "responses",
      ),
    }),
  ).rejects.toThrow("request captured");
  expect(wire.requests[0]?.["tools"]).toMatchObject([{ strict: true }, { strict: false }]);
});
