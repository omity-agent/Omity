import { defaultBuiltIns, toolProperties, writeToolboxConfiguration } from "../../support/builtins";
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import {
  parseMcpConfiguration,
  readProfileMcpConfiguration,
} from "../../../src/infrastructure/mcp/configuration";
import { createSettingsContext } from "../../../src/infrastructure/configuration/settings/context";
import { createTestDirectory } from "../../support/artifacts";
import { join } from "node:path";
import { loadBuiltInTools } from "../../../src/infrastructure/toolbox/loadBuiltIns";
import { modelToolDefinitions } from "../../../src/infrastructure/mcp/tools/definitions";
import { stringify } from "yaml";

test("each built-in can be disabled independently", () => {
  for (const key of ["choice", "open_ended", "update_title"] as const) {
    const settings = defaultBuiltIns();
    settings[key]!.enabled = true;
    expect(loadBuiltInTools(settings, {}).some(({ name }) => name === settings[key]!.name)).toBe(
      true,
    );
    settings[key]!.enabled = false;
    expect(loadBuiltInTools(settings, {}).some(({ name }) => name === settings[key]!.name)).toBe(
      false,
    );
  }
  expect(loadBuiltInTools({}, {})).toEqual([]);
});
test("built-in defer flags apply independently and reject non-boolean configuration", () => {
  const toolboxes = defaultBuiltIns();
  toolboxes.choice!.defer_loading = true;
  toolboxes.open_ended!.defer_loading = false;
  toolboxes.update_title!.enabled = false;
  const configuration = parseMcpConfiguration({ toolboxes }, "toolbox.yaml"),
    definitions = modelToolDefinitions(loadBuiltInTools(configuration.toolboxes, {}), new Map());
  expect(definitions.filter(({ deferLoading }) => deferLoading).map(({ name }) => name)).toEqual([
    toolboxes.choice!.name,
  ]);
  expect(() =>
    parseMcpConfiguration(
      {
        toolboxes: { choice: { ...toolboxes.choice, defer_loading: "true" } },
      },
      "toolbox.yaml",
    ),
  ).toThrow();
});
test("default and profile layers configure names, descriptions and validation together", async () => {
  const root = createTestDirectory("builtin-layers"),
    user = join(root, "user"),
    profile = join(user, "profiles", "custom"),
    titleBounds = defaultBuiltIns().update_title!.parameters.title,
    maximum = titleBounds.minLength + 5;
  mkdirSync(join(root, "settings"));
  mkdirSync(profile, { recursive: true });
  writeToolboxConfiguration(root, {
    toolboxes: {
      choice: {
        description: "默认描述",
        enabled: true,
        name: "pick",
        parameters: {
          options: { minItems: 0 },
          question: { minLength: 3 },
        },
      },
    },
  });
  writeFileSync(join(user, "profile.yaml"), "- custom\n");
  writeFileSync(
    join(profile, "toolbox.yaml"),
    stringify({
      toolboxes: {
        choice: {
          description: "配置集描述",
          parameters: { question: { description: "配置集参数" } },
        },
        update_title: { parameters: { title: { maxLength: maximum } } },
      },
    }),
  );
  try {
    const configuration = readProfileMcpConfiguration(createSettingsContext(root, user))!,
      tools = loadBuiltInTools(configuration.toolboxes, { askUser: async () => "answer" }),
      choice = tools.find(({ name }) => name === "pick")!;
    expect(choice.description).toBe("配置集描述");
    expect(toolProperties(choice)["question"]).toMatchObject({
      description: "配置集参数",
      minLength: 3,
    });
    expect(configuration.toolboxes.update_title!.parameters.title).toMatchObject({
      maxLength: maximum,
      minLength: titleBounds.minLength,
    });
    expect(choice.invoke({ multiple: false, options: [], question: "短" })).rejects.toThrow();
  } finally {
    rmSync(root, { recursive: true });
  }
});
test.each([
  { maxLength: 40, minLength: 0 },
  { maxLength: 2, minLength: 3 },
  { maxLength: 2.5, minLength: 2 },
  { maxLength: Number.MAX_SAFE_INTEGER + 1, minLength: 2 },
])("invalid title bounds are rejected in configuration: %j", (bounds) => {
  const toolboxes = defaultBuiltIns();
  Object.assign(toolboxes.update_title!.parameters.title, bounds);
  expect(() => parseMcpConfiguration({ toolboxes }, "toolbox.yaml")).toThrow();
});
