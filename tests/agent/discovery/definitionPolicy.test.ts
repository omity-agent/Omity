import { aiRequestOptions, buildAiModel, modelApi } from "../../../src/agent/model/provider";
import { deferredDefinition, discoverySettings } from "./wireFixtures";
import { expect, test } from "bun:test";
import { aiModelTools } from "../../../src/agent/model/tools";
import { parseModelSettings } from "../../../src/infrastructure/configuration/settings/schema";

test("tool search is only registered when deferred tools exist", () => {
  for (const api of ["responses", "messages", "completions"] as const) {
    expect(
      Object.keys(aiModelTools([{ ...deferredDefinition, deferLoading: false }], api)),
    ).toEqual(["find_file"]);
  }
});
test("unsupported defer configurations and search-name collisions fail explicitly", () => {
  expect(() => aiModelTools([deferredDefinition], "completions")).toThrow("Defer loading");
  expect(() => aiModelTools([{ ...deferredDefinition, freeform: true }], "responses")).toThrow(
    "free-form",
  );
  expect(() =>
    aiModelTools([{ ...deferredDefinition, deferLoading: false, freeform: true }], "messages"),
  ).toThrow("free-form");
  for (const [api, name] of [
    ["responses", "tool_search"],
    ["messages", "tool_search_tool_regex"],
  ] as const) {
    expect(() => aiModelTools([{ ...deferredDefinition, name }], api)).toThrow("名称冲突");
  }
});
test("Messages model selection and reasoning options use Anthropic provider configuration", () => {
  const settings = discoverySettings("messages");
  settings.model = parseModelSettings({
    ...settings.model,
    apiKeyEnv: "PATH",
    reasoning_effort: "high",
  });
  expect(modelApi(settings)).toBe("messages");
  expect(buildAiModel(settings).provider).toBe("anthropic.messages");
  expect(aiRequestOptions(settings, "session")).toEqual({
    instructions: "test",
    providerOptions: {
      anthropic: { effort: "high", thinking: { display: "summarized", type: "adaptive" } },
    },
  });
  settings.model.reasoning_effort = "none";
  expect(aiRequestOptions(settings, "session").providerOptions).toEqual({
    anthropic: { thinking: { type: "disabled" } },
  });
  settings.model.reasoning_effort = "minimal";
  expect(() => aiRequestOptions(settings, "session")).toThrow("minimal");
});
