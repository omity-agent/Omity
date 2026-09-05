import { expect, test } from "bun:test";
import { parseMcpConfiguration } from "../../../src/infrastructure/mcp/configuration";
import { z } from "zod";

test.each([
  ["toolNameOverrides", "search"],
  ["toolNameOverrides", { search: "" }],
  ["toolNameOverrides", { search: "agent" }],
  ["toolNameOverrides", { search: 42 }],
  ["toolDescriptionOverrides", []],
  ["toolDescriptionOverrides", { search: "" }],
  ["toolDescriptionOverrides", { search: false }],
  ["freeformToolInputs", "search"],
  ["freeformToolInputs", [""]],
  ["freeformToolInputs", ["search", 42]],
  ["freeformToolInputs", ["search", "search"]],
])("MCP %s is validated by its configuration schema (%j)", (field, value) => {
  let failure: unknown;
  try {
    parseMcpConfiguration({ [field]: value }, "toolbox.yaml");
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(z.ZodError);
  if (!(failure instanceof z.ZodError)) {
    throw new Error("Expected structured validation failure");
  }
  expect(failure.issues.some((issue) => issue.path[0] === field)).toBe(true);
});
test("missing or null customizations normalize to independent empty containers", () => {
  const omitted = parseMcpConfiguration({}, "toolbox.yaml"),
    explicit = parseMcpConfiguration(
      {
        freeformToolInputs: null,
        toolDescriptionOverrides: null,
        toolNameOverrides: null,
      },
      "toolbox.yaml",
    );
  expect(omitted).toEqual(explicit);
  omitted.freeformToolInputs.push("modified");
  expect(explicit.freeformToolInputs).toEqual([]);
  expect(explicit.toolNameOverrides).toEqual({});
  expect(explicit.toolDescriptionOverrides).toEqual({});
});
test("invalid customization entries remain diagnosable by their complete field path", () => {
  try {
    parseMcpConfiguration(
      {
        toolDescriptionOverrides: { invalid: "", valid: "prompts/search.md" },
      },
      "toolbox.yaml",
    );
    throw new Error("Expected validation failure");
  } catch (error) {
    expect(error).toBeInstanceOf(z.ZodError);
    if (!(error instanceof z.ZodError)) {
      throw error;
    }
    expect(error.issues[0]?.path).toEqual(["toolDescriptionOverrides", "invalid"]);
  }
});
