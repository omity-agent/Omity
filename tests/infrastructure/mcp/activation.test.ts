import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { normalizeMcpServers, parseMcpConfiguration } from "../../../src/infrastructure/mcp/config";
import { Logger } from "../../../src/infrastructure/logging/logger";
import { createSettingsContext } from "../../../src/infrastructure/configuration/settings/context";
import { createTestDirectory } from "../../support/artifacts";
import { join } from "node:path";
import { loadMcp } from "../../../src/infrastructure/mcp/loadTools";
import { readLayeredSettingsYaml } from "../../../src/infrastructure/configuration/settings/files";

test("MCP config omits disabled servers and consumes enabled flags", () => {
  expect(
    normalizeMcpServers({
      disabled: {
        args: null,
        command: "disabled.exe",
        enabled: false,
      },
      explicit: {
        command: "enabled.exe",
        enabled: true,
      },
      implicit: {
        command: "default.exe",
      },
    }),
  ).toEqual({
    explicit: {
      args: [],
      command: "enabled.exe",
      stderr: "pipe",
    },
    implicit: {
      args: [],
      command: "default.exe",
      stderr: "pipe",
    },
  });
});
test("MCP config rejects non-boolean enabled flags", () => {
  expect(() =>
    normalizeMcpServers({
      invalid: {
        command: "server.exe",
        enabled: "false",
      },
    }),
  ).toThrow();
});
test("profile MCP settings can disable a repository server", () => {
  const root = createTestDirectory("mcp-disabled-override");
  const userSettings = join(root, "user-settings");
  try {
    mkdirSync(join(root, "settings"), { recursive: true });
    const profile = join(userSettings, "profiles", "tools");
    mkdirSync(profile, { recursive: true });
    writeFileSync(join(userSettings, "profile.yaml"), "- tools\n");
    writeFileSync(
      join(root, "settings", "mcp.yaml"),
      `mcpServers:
  terminal:
    command: terminal
  web:
    command: web
toolNameOverrides:
  terminal__open: open
  web__search: search
toolDescriptionOverrides:
  open: missing.md
  search: search.md
freeformToolInputs: [open, search]
`,
    );
    writeFileSync(join(profile, "mcp.yaml"), "mcpServers:\n  terminal:\n    enabled: false\n");
    const file = readLayeredSettingsYaml(
      createSettingsContext(root, userSettings),
      "profile",
      "mcp.yaml",
    );
    const configuration = parseMcpConfiguration(file?.value, file?.path ?? "mcp.yaml");
    expect(configuration).toEqual({
      freeformToolInputs: ["search"],
      mcpServers: {
        web: {
          args: [],
          command: "web",
          stderr: "pipe",
        },
      },
      stdio: {
        restart: {
          delayMs: 1000,
          maxAttempts: 3,
        },
      },
      toolDescriptionOverrides: {
        search: "search.md",
      },
      toolNameOverrides: {
        web__search: "search",
      },
    });
  } finally {
    rmSync(root, { recursive: true });
  }
});
test("disabled MCP servers are not started", async () => {
  const root = createTestDirectory("mcp-disabled");
  const settings = join(root, "settings");
  mkdirSync(settings);
  writeFileSync(
    join(settings, "mcp.yaml"),
    `mcpServers:
  disabled:
    enabled: false
    command: \${MISSING_DISABLED_MCP_COMMAND}
`,
  );
  try {
    const mcp = await loadMcp(
      root,
      new Logger("error", true),
      createSettingsContext(root, join(root, "user")),
    );
    expect(mcp.tools).toEqual([]);
    await mcp.close();
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
