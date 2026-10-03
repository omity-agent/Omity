import { defaultBuiltIns, writeToolboxConfiguration } from "../../../support/builtins";
import { expect, test } from "bun:test";
import { loadMcp, loadSessionMcp } from "../../../../src/infrastructure/mcp/tools/catalog";
import { mkdirSync, rmSync } from "node:fs";
import { Logger } from "../../../../src/infrastructure/logging/logger";
import { createSettingsContext } from "../../../../src/infrastructure/configuration/settings/context";
import { createTestDirectory } from "../../../support/artifacts";
import { join } from "node:path";
import { snapshotMcpTools } from "../../../../src/infrastructure/mcp/tools/definitions";

test.each([true, false])(
  "session tools remain callable after configuration disables them (server prefix: %s)",
  async (prefixToolNameWithServerName) => {
    const root = createTestDirectory("frozen-mcp-availability"),
      logger = new Logger("error", true),
      context = createSettingsContext(root, join(root, "user-settings")),
      builtIns = defaultBuiltIns(),
      server = {
        args: [
          join(import.meta.dir, "../../../app/http/preferences/argumentServer.ts"),
          "original",
        ],
        command: process.execPath,
        defer_loading: prefixToolNameWithServerName,
        enabled: true,
        freeformToolInputs: prefixToolNameWithServerName ? [] : ["original"],
        prefixToolNameWithServerName,
      },
      toolboxes = {
        ...builtIns,
        update_title: { ...builtIns.update_title!, enabled: false },
      },
      configuration = {
        mcpServers: { active: server },
        toolNameOverrides: {
          [prefixToolNameWithServerName ? "active__original" : "original"]: "frozen_tool",
        },
        toolboxes,
      };
    mkdirSync(join(root, "settings"));
    try {
      writeToolboxConfiguration(root, configuration);
      const initial = await loadMcp(root, logger, context),
        snapshot = snapshotMcpTools(initial, { cwd: root, session: root });
      await initial.close();
      writeToolboxConfiguration(root, {
        ...configuration,
        mcpServers: { active: { ...server, defer_loading: false, enabled: false } },
        toolboxes: Object.fromEntries(
          Object.entries(builtIns).map(([id, preferences]) => [
            id,
            { ...preferences, enabled: id === "update_title" },
          ]),
        ),
      });
      const fresh = await loadMcp(root, logger, context);
      try {
        expect(Object.keys(fresh.configuration.mcpServers)).toEqual([]);
        expect(fresh.tools.map(({ name }) => name)).toEqual([builtIns.update_title!.name]);
      } finally {
        await fresh.close();
      }
      const restored = await loadSessionMcp(logger, context, snapshot);
      try {
        expect(Object.keys(restored.configuration.mcpServers)).toEqual(["active"]);
        expect(restored.tools.map(({ name }) => name)).toEqual(
          snapshot.tools.map(({ name }) => name),
        );
        expect(restored.freeformToolParameters.has("frozen_tool")).toBe(
          !prefixToolNameWithServerName,
        );
        const tool = restored.tools.find(({ name }) => name === "frozen_tool")!;
        expect(tool.extras?.["defer_loading"]).toBe(prefixToolNameWithServerName);
        expect(await tool.invoke({ input: "after restart" })).toContain("after restart");
      } finally {
        await restored.close();
      }
      writeToolboxConfiguration(root, {
        ...configuration,
        mcpServers: {
          active: {
            ...server,
            args: [
              join(import.meta.dir, "../../../app/http/preferences/argumentServer.ts"),
              "replacement",
            ],
            enabled: false,
          },
        },
      });
      expect(loadSessionMcp(logger, context, snapshot)).rejects.toMatchObject({
        code: "MCP_LOAD_FAILED",
        details: {
          failures: [
            {
              error: { message: "会话冻结的 MCP 工具不存在：frozen_tool" },
              stage: "customization",
            },
          ],
        },
      });
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  },
  15_000,
);

test("session server selections override changed configuration activation flags", async () => {
  const root = createTestDirectory("frozen-server-selection"),
    logger = new Logger("error", true),
    context = createSettingsContext(root, join(root, "user-settings")),
    server = {
      args: [join(import.meta.dir, "../../../app/http/preferences/argumentServer.ts"), "identity"],
      command: process.execPath,
    },
    overrides = { excluded: false, selected: true };
  mkdirSync(join(root, "settings"));
  try {
    writeToolboxConfiguration(root, {
      mcpServers: {
        excluded: { command: `\${OMITY_FROZEN_EXCLUDED_COMMAND}`, enabled: false },
        selected: { ...server, enabled: true },
      },
    });
    const initial = await loadMcp(root, logger, context, { serverOverrides: overrides }),
      snapshot = snapshotMcpTools(initial, { cwd: root, session: root }, overrides);
    await initial.close();
    writeToolboxConfiguration(root, {
      mcpServers: {
        excluded: { command: `\${OMITY_FROZEN_EXCLUDED_COMMAND}`, enabled: true },
        selected: { ...server, enabled: false },
      },
    });
    const restored = await loadSessionMcp(logger, context, snapshot);
    try {
      expect(Object.keys(restored.configuration.mcpServers)).toEqual(["selected"]);
      expect(restored.tools.map(({ name }) => name)).toEqual(
        snapshot.tools.map(({ name }) => name),
      );
      expect(
        await restored.tools
          .find(({ name }) => name === "selected__identity")!
          .invoke({
            input: "selected session",
          }),
      ).toContain("selected session");
    } finally {
      await restored.close();
    }
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}, 15_000);
