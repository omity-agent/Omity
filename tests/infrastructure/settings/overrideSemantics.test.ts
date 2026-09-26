import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { expect, test } from "bun:test";
import { join, resolve } from "node:path";
import { createSettingsContext } from "../../../src/infrastructure/configuration/settings/context";
import { createTestDirectory } from "../../support/artifacts";
import { loadSettings } from "../../../src/infrastructure/configuration/settings/load";
import { readLayeredSettingsYaml } from "../../../src/infrastructure/configuration/settings/files";
import { writeTestConfiguration } from "../../support/configuration";

test.each(["null", '""', "[]", "{}"])("explicit %s replaces inherited values", (empty) => {
  const root = createTestDirectory("explicit-empty"),
    user = join(root, "user"),
    profile = join(user, "profiles", "override");
  try {
    mkdirSync(join(root, "settings"), { recursive: true });
    mkdirSync(profile, { recursive: true });
    writeFileSync(join(root, "settings", "agent.yaml"), "value: { inherited: true }\nkeep: 1\n");
    writeFileSync(join(profile, "agent.yaml"), `value: ${empty}\n`);
    const context = createSettingsContext(root, user, ["override"]),
      result = readLayeredSettingsYaml(context, "profile", "agent.yaml");
    expect(result?.value).toEqual({ keep: 1, value: JSON.parse(empty) });
  } finally {
    rmSync(root, { recursive: true });
  }
});
test("a cleared map stays cleared across later partial profiles", () => {
  const root = createTestDirectory("map-reset"),
    user = join(root, "user");
  try {
    mkdirSync(join(root, "settings"), { recursive: true });
    writeFileSync(join(root, "settings", "agent.yaml"), "values: { old: true }\n");
    for (const [name, yaml] of [
      ["clear", "values: {}\n"],
      ["empty", "# no overrides\n"],
      ["add", "values: { new: false }\n"],
    ]) {
      const directory = join(user, "profiles", name!);
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, "agent.yaml"), yaml!);
    }
    const context = createSettingsContext(root, user, ["clear", "empty", "add"]);
    expect(readLayeredSettingsYaml(context, "profile", "agent.yaml")?.value).toEqual({
      values: { new: false },
    });
  } finally {
    rmSync(root, { recursive: true });
  }
});
test.each(["", "null", '""'])(
  "blank model options and collections clear inherited values: %s",
  (empty) => {
    const root = createTestDirectory("typed-empty"),
      userSettingsDir = join(root, "user"),
      profile = join(userSettingsDir, "profiles", "clear");
    try {
      writeTestConfiguration(root);
      mkdirSync(profile, { recursive: true });
      writeFileSync(join(userSettingsDir, "profile.yaml"), "- clear\n");
      writeFileSync(
        join(profile, "model.yaml"),
        `temperature: ${empty}\nreasoning_effort: ${empty}\n`,
      );
      writeFileSync(
        join(profile, "agent.yaml"),
        `prompts: ${empty}\nskills:\n  skillEnabled: ${empty}\n`,
      );
      writeFileSync(join(profile, "hooks.yaml"), `hooks: ${empty}\n`);
      const settings = loadSettings(root, { userSettingsDir });
      expect(settings.model.temperature).toBeUndefined();
      expect(settings.model.reasoning_effort).toBeUndefined();
      expect(settings.agent.systemPrompt).toBe("");
      expect(settings.skills.skillEnabled).toEqual({});
      expect(settings.hooks).toEqual([]);
      writeFileSync(join(profile, "model.yaml"), `maxConcurrentRequests: ${empty}\n`);
      expect(() => loadSettings(root, { userSettingsDir })).toThrow();
    } finally {
      rmSync(root, { recursive: true });
    }
  },
);
test("disabled prediction accepts partial model overrides without inheriting the session model", () => {
  const root = createTestDirectory("prediction-draft"),
    userSettingsDir = join(root, "user");
  try {
    writeTestConfiguration(root);
    copyFileSync(
      resolve(import.meta.dir, "../../../settings/main.yaml"),
      join(root, "settings", "main.yaml"),
    );
    mkdirSync(userSettingsDir);
    const path = join(userSettingsDir, "main.yaml");
    for (const enabled of ["", "  enabled: false\n"]) {
      writeFileSync(path, `prediction:\n${enabled}  model:\n    model: gpt-6-luna\n`);
      const { prediction } = loadSettings(root, { userSettingsDir });
      expect(prediction?.enabled).toBe(false);
      expect(prediction?.model?.model).toBe("gpt-6-luna");
      expect(prediction?.model?.adapter).toBeUndefined();
    }
    writeFileSync(path, "prediction:\n  enabled: true\n  model:\n    model: gpt-6-luna\n");
    expect(() => loadSettings(root, { userSettingsDir })).toThrow();
    writeFileSync(path, "prediction:\n  model:\n");
    expect(loadSettings(root, { userSettingsDir }).prediction?.model).toBeUndefined();
  } finally {
    rmSync(root, { recursive: true });
  }
});
