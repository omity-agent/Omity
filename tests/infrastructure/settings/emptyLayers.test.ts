import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createTestDirectory } from "../../support/artifacts";
import { join } from "node:path";
import { loadSettings } from "../../../src/infrastructure/configuration/settings/load";
import { writeTestConfiguration } from "../../support/configuration";

test("empty YAML layers preserve lower-precedence settings", () => {
  const root = createTestDirectory("empty-configuration-layers"),
    userSettingsDir = join(root, "user-settings"),
    profileDir = join(userSettingsDir, "profiles", "empty");
  try {
    writeTestConfiguration(root);
    mkdirSync(profileDir, { recursive: true });
    writeFileSync(join(userSettingsDir, "profile.yaml"), "- empty\n");
    writeFileSync(join(userSettingsDir, "main.yaml"), "");
    writeFileSync(join(profileDir, "agent.yaml"), " \n");
    writeFileSync(join(profileDir, "model.yaml"), "# no overrides\n");
    writeFileSync(join(profileDir, "hooks.yaml"), "\n# no overrides\n");
    const settings = loadSettings(root, { userSettingsDir });
    expect(settings.server).toEqual({ host: "127.0.0.1", port: 3030 });
    expect(settings.agent.recursionLimit).toBe(1);
    expect(settings.model.model).toBe("test");
    expect(settings.hooks).toEqual([]);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
test("an explicit null layer remains invalid", () => {
  const root = createTestDirectory("null-configuration-layer"),
    userSettingsDir = join(root, "user-settings");
  try {
    writeTestConfiguration(root);
    mkdirSync(userSettingsDir, { recursive: true });
    writeFileSync(join(userSettingsDir, "main.yaml"), "null\n");
    expect(() => loadSettings(root, { userSettingsDir })).toThrow(
      "Invalid input: expected object, received null",
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
