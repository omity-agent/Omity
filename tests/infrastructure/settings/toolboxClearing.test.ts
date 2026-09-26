import { completeToolboxYaml, defaultBuiltIns } from "../../support/builtins";
import {
  emptyMcpConfiguration,
  parseMcpConfiguration,
  readProfileMcpConfiguration,
} from "../../../src/infrastructure/mcp/configuration";
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createSettingsContext } from "../../../src/infrastructure/configuration/settings/context";
import { createTestDirectory } from "../../support/artifacts";
import { join } from "node:path";
import { loadBuiltInTools } from "../../../src/infrastructure/toolbox/loadBuiltIns";

test.each(["null", '""', "{}"])("toolbox collections clear inherited entries with %s", (empty) => {
  const root = createTestDirectory("toolbox-clearing"),
    user = join(root, "user"),
    profile = join(user, "profiles", "clear");
  try {
    mkdirSync(join(root, "settings"), { recursive: true });
    mkdirSync(profile, { recursive: true });
    writeFileSync(
      join(root, "settings", "toolbox.yaml"),
      completeToolboxYaml({
        freeformToolInputs: ["old"],
        mcpServers: { old: { command: `\${MISSING_CLEARED_COMMAND}` } },
        toolDescriptionOverrides: { old: `\${MISSING_CLEARED_DESCRIPTION}` },
        toolNameOverrides: { old__tool: "old" },
        toolboxes: defaultBuiltIns(),
      }),
    );
    writeFileSync(
      join(profile, "toolbox.yaml"),
      [
        `freeformToolInputs: ${empty === "{}" ? "[]" : empty}`,
        ...["mcpServers", "toolDescriptionOverrides", "toolNameOverrides", "toolboxes"].map(
          (key) => `${key}: ${empty}`,
        ),
      ].join("\n"),
    );
    expect(readProfileMcpConfiguration(createSettingsContext(root, user, ["clear"]))).toEqual(
      emptyMcpConfiguration(),
    );
  } finally {
    rmSync(root, { recursive: true });
  }
});
test("toolbox parsing rejects missing required fields and an empty restart policy", () => {
  expect(() => parseMcpConfiguration({}, "toolbox.yaml")).toThrow();
  for (const stdio of [null, "", {}]) {
    expect(() =>
      parseMcpConfiguration({ ...emptyMcpConfiguration(), stdio }, "toolbox.yaml"),
    ).toThrow();
  }
});
test("clearing a single built-in removes it without disabling other tools", () => {
  const configuration = parseMcpConfiguration(
    {
      ...emptyMcpConfiguration(),
      toolboxes: { ...defaultBuiltIns(), choice: null },
    },
    "toolbox.yaml",
  );
  expect(loadBuiltInTools(configuration.toolboxes, {}).map(({ name }) => name)).toEqual([
    "ask_user__open_ended",
    "update_title",
  ]);
});
