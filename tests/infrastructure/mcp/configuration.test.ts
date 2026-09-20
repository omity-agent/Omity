import { expect, spyOn, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/client";
import { Logger } from "../../../src/infrastructure/logging/logger";
import { RestartingStdioClient } from "../../../src/infrastructure/mcp/client/restarting";
import { createSettingsContext } from "../../../src/infrastructure/configuration/settings/context";
import { createTestDirectory } from "../../support/artifacts";
import { join } from "node:path";
import { loadMcp } from "../../../src/infrastructure/mcp/tools/catalog";
import { parseMcpConfiguration } from "../../../src/infrastructure/mcp/configuration";
import { snapshotMcpTools } from "../../../src/infrastructure/mcp/tools/definitions";
import { z } from "zod";

test.each([
  ["mcpServers", { search: { command: "search", defer_loading: "true" } }],
  ["mcpServers", { search: { command: "search", prefixToolNameWithServerName: "false" } }],
  ["mcpServers", { search: { command: "search", prefixToolNameWithServerName: null } }],
  ["mcpServers", { search: { command: "search", excludedTools: "search" } }],
  ["mcpServers", { search: { command: "search", excludedTools: null } }],
  ["mcpServers", { search: { command: "search", excludedTools: [""] } }],
  ["mcpServers", { search: { command: "search", excludedTools: ["search", 42] } }],
  ["mcpServers", { search: { command: "search", excludedTools: ["search", "search"] } }],
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
test("MCP server preferences are preserved independently for stdio and HTTP servers", () => {
  const configuration = parseMcpConfiguration(
    {
      mcpServers: {
        local: {
          command: "local",
          excludedTools: ["delete"],
          prefixToolNameWithServerName: false,
        },
        remote: {
          excludedTools: [],
          prefixToolNameWithServerName: true,
          url: "https://example.com/mcp",
        },
      },
    },
    "toolbox.yaml",
  );
  expect(configuration.mcpServers["local"]).toMatchObject({
    command: "local",
    excludedTools: ["delete"],
    prefixToolNameWithServerName: false,
  });
  expect(configuration.mcpServers["remote"]).toMatchObject({
    excludedTools: [],
    prefixToolNameWithServerName: true,
    url: "https://example.com/mcp",
  });
});
test.each([true, false])(
  "excluded tools and their customizations stay out of the catalog and snapshot (prefix: %s)",
  async (prefix) => {
    const root = createTestDirectory("mcp-excluded-catalog"),
      settings = join(root, "settings"),
      source = prefix ? "local__blocked" : "blocked",
      client = new Client({ name: "exclusion-test", version: "1" });
    client.listTools = async () => ({
      tools: ["blocked", "Blocked", "blocked_extra"].map((name) => ({
        inputSchema: { properties: {}, type: "object" as const },
        name,
      })),
    });
    const create = RestartingStdioClient.create.bind(RestartingStdioClient),
      connect = spyOn(RestartingStdioClient, "create").mockImplementation(
        (name, connection, policy, logger) =>
          create(name, connection, policy, logger, async (_server, _options, signal) => {
            const closed = Promise.withResolvers<void>();
            return {
              client,
              close: async () => closed.resolve(),
              closed: closed.promise,
              diagnostics: () => "",
              isClosed: () => signal?.aborted === true,
            };
          }),
      );
    mkdirSync(settings);
    writeFileSync(
      join(settings, "toolbox.yaml"),
      JSON.stringify({
        freeformToolInputs: ["blocked_alias"],
        mcpServers: {
          local: {
            command: "unused",
            defer_loading: true,
            excludedTools: ["blocked"],
            prefixToolNameWithServerName: prefix,
          },
          other: { command: "unused" },
        },
        toolDescriptionOverrides: { blocked_alias: "missing-description.md" },
        toolNameOverrides: { [source]: "blocked_alias" },
      }),
    );
    try {
      const mcp = await loadMcp(
        root,
        new Logger("error", true),
        createSettingsContext(root, join(root, "user")),
      );
      try {
        const names = [
          ...(prefix ? ["local__Blocked", "local__blocked_extra"] : ["Blocked", "blocked_extra"]),
          "other__blocked",
          "other__Blocked",
          "other__blocked_extra",
        ];
        expect(mcp.tools.map(({ name }) => name)).toEqual(names);
        expect(connect.mock.calls[0]?.[1]).not.toHaveProperty("excludedTools");
        expect(mcp.freeformToolParameters.size).toBe(0);
        const snapshot = snapshotMcpTools(mcp, { cwd: root, session: root });
        expect(snapshot.tools.map(({ name }) => name)).toEqual(names);
        expect(snapshot.tools.map(({ deferLoading }) => deferLoading)).toEqual([
          true,
          true,
          undefined,
          undefined,
          undefined,
        ]);
      } finally {
        await mcp.close();
      }
    } finally {
      connect.mockRestore();
      rmSync(root, { recursive: true });
    }
  },
);
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
