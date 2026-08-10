import { createMcpLoadError, loadMcp } from "../../../src/infrastructure/mcp/loadTools";
import { expect, spyOn, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { Logger } from "../../../src/infrastructure/logging/logger";
import { connectStdioClient } from "../../../src/infrastructure/mcp/client/stdio";
import { createSettingsContext } from "../../../src/infrastructure/configuration/settings/context";
import { createTestDirectory } from "../../support/artifacts";
import { errorResponse } from "../../../src/app/http/errors";
import { join } from "node:path";

test("stdio diagnostics are attached to initialization errors", async () => {
  const output = "error: unsupported option --broken";
  expect(
    connectStdioClient("diff", {
      args: ["-e", `process.stderr.write(${JSON.stringify(output)}); process.exit(2)`],
      command: process.execPath,
      stderr: "pipe",
    }),
  ).rejects.toThrow(`子进程 stderr：\n${output}`);
});
test("stdio client negotiates the modern MCP protocol", async () => {
  const connection = await connectStdioClient("modern", {
    args: ["-e", modernMcpServer],
    command: process.execPath,
    stderr: "pipe",
  });
  try {
    expect(connection.client.getProtocolEra()).toBe("modern");
    expect(await connection.client.listTools({}, { timeout: 1 })).toEqual({
      cacheScope: "private",
      tools: [],
      ttlMs: 0,
    });
  } finally {
    await connection.close();
  }
});
test("stdio client falls back to the legacy MCP protocol", async () => {
  const connection = await connectStdioClient("legacy", {
    args: ["-e", legacyMcpServer],
    command: process.execPath,
    stderr: "pipe",
  });
  try {
    expect(connection.client.getProtocolEra()).toBe("legacy");
  } finally {
    await connection.close();
  }
});
test("MCP loading propagates captured stderr", async () => {
  const root = createTestDirectory("mcp-stderr"),
    settings = join(root, "settings");
  mkdirSync(settings);
  const output = "error: invalid argument from configured server";
  writeFileSync(
    join(settings, "toolbox.yaml"),
    `mcpServers:
  diff:
    command: ${JSON.stringify(process.execPath)}
    args:
      - -e
      - ${JSON.stringify(`process.stderr.write(${JSON.stringify(output)}); process.exit(2)`)}
`,
  );
  try {
    expect(
      loadMcp(root, new Logger("error", true), createSettingsContext(root, join(root, "user"))),
    ).rejects.toThrow(`子进程 stderr：\n${output}`);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
const modernMcpServer = String.raw`
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
  for (;;) {
    const boundary = input.indexOf("\n");
    if (boundary < 0) break;
    const line = input.slice(0, boundary);
    input = input.slice(boundary + 1);
    if (!line) continue;
    const request = JSON.parse(line);
    const result =
      request.method === "server/discover"
        ? {
            resultType: "complete",
            supportedVersions: ["2026-07-28"],
            capabilities: { tools: {} },
            _meta: {
              "io.modelcontextprotocol/serverInfo": { name: "modern-test", version: "1" },
            },
          }
        : request.method === "tools/list"
          ? { cacheScope: "private", resultType: "complete", tools: [], ttlMs: 0 }
          : undefined;
    const response = {
      jsonrpc: "2.0",
      id: request.id,
      ...(result
        ? { result }
        : { error: { code: -32601, message: "Unknown method: " + request.method } }),
    };
    const send = () => process.stdout.write(JSON.stringify(response) + "\n");
    if (request.method === "tools/list") setTimeout(send, 20);
    else send();
  }
});
`,
  legacyMcpServer = String.raw`
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
const server = new McpServer({ name: "legacy-test", version: "1" });
await server.connect(new StdioServerTransport());
`;
test("MCP load errors are returned to the browser without terminal logging", () => {
  const log = spyOn(console, "error").mockReturnValue(undefined);
  try {
    const response = errorResponse(createMcpLoadError(new Error("captured stderr")));
    expect(response.body.error.message).toContain("captured stderr");
    expect(log).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
  }
});
