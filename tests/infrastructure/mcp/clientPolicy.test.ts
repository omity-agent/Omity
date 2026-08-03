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
test("MCP loading propagates captured stderr", async () => {
  const root = createTestDirectory("mcp-stderr");
  const settings = join(root, "settings");
  mkdirSync(settings);
  const output = "error: invalid argument from configured server";
  writeFileSync(
    join(settings, "mcp.yaml"),
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
