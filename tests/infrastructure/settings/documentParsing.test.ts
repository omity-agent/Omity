import { expect, spyOn, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createSettingsContext } from "../../../src/infrastructure/configuration/settings/context";
import { createTestDirectory } from "../../support/artifacts";
import { join } from "node:path";
import { readLayeredSettingsYaml } from "../../../src/infrastructure/configuration/settings/files";
import { readSettingsYamlFile } from "../../../src/infrastructure/configuration/placeholders";

test("rejects multi-document YAML settings", () => {
  withDocument("value: 1\n---\nvalue: 2\n", (path) => {
    expect(() => readSettingsYamlFile(path)).toThrow();
  });
});
test("surfaces YAML warnings with the configuration source", () => {
  const warning = spyOn(console, "warn").mockReturnValue(undefined);
  try {
    withDocument("value: !unrecognized text\n", (path) => {
      expect(readSettingsYamlFile(path).value).toEqual({ value: "text" });
      expect(warning).toHaveBeenCalledWith(expect.stringContaining(path));
    });
  } finally {
    warning.mockRestore();
  }
});
test("merges records immutably while replacing arrays, nulls and type changes", () => {
  const root = createTestDirectory("merge-semantics"),
    settings = join(root, "settings"),
    user = join(root, "user"),
    profile = join(user, "profiles", "work");
  try {
    mkdirSync(settings, { recursive: true });
    mkdirSync(profile, { recursive: true });
    writeFileSync(
      join(settings, "toolbox.yaml"),
      [
        "nested: { retained: 1, overridden: old }",
        "items: [one, two]",
        "nullable: { old: true }",
        "changed: [old]",
      ].join("\n"),
    );
    writeFileSync(
      join(profile, "toolbox.yaml"),
      ["nested: { overridden: new }", "items: []", "nullable: null", "changed: { new: true }"].join(
        "\n",
      ),
    );
    const result = readLayeredSettingsYaml(
      createSettingsContext(root, user, ["work"]),
      "profile",
      "toolbox.yaml",
      {},
      {
        override(value, layer) {
          expect(layer).toEqual({
            changed: { new: true },
            items: [],
            nested: { overridden: "new" },
            nullable: null,
          });
          return value;
        },
      },
    );
    expect(result?.value).toEqual({
      changed: { new: true },
      items: [],
      nested: { overridden: "new", retained: 1 },
      nullable: null,
    });
  } finally {
    rmSync(root, { recursive: true });
  }
});
function withDocument(source: string, verify: (path: string) => void) {
  const root = createTestDirectory("yaml-document"),
    path = join(root, "document.yaml");
  try {
    writeFileSync(path, source);
    verify(path);
  } finally {
    rmSync(root, { recursive: true });
  }
}
