import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createSettingsContext } from "../../../src/infrastructure/configuration/settings/context";
import { createTestDirectory } from "../../support/artifacts";
import { join } from "node:path";
import { readLayeredSettingsYaml } from "../../../src/infrastructure/configuration/settings/files";

test("profile transforms reuse the same layer snapshot used for merging", () => {
  const root = createTestDirectory("layer-snapshot"),
    user = join(root, "user"),
    profile = join(user, "profiles", "tools"),
    path = join(profile, "toolbox.yaml");
  try {
    mkdirSync(join(root, "settings"), { recursive: true });
    mkdirSync(profile, { recursive: true });
    writeFileSync(join(root, "settings", "toolbox.yaml"), "value: default\n");
    writeFileSync(path, "value: original\n");
    const result = readLayeredSettingsYaml(
      createSettingsContext(root, user, ["tools"]),
      "profile",
      "toolbox.yaml",
      {},
      {
        beforePlaceholders(value) {
          writeFileSync(path, "value: changed\n");
          return value;
        },
        override(value, layer, directory) {
          expect(layer).toEqual({ value: "original" });
          expect(directory).toBe(profile);
          return value;
        },
      },
    );
    expect(result?.value).toEqual({ value: "original" });
  } finally {
    rmSync(root, { recursive: true });
  }
});
