import { expect, spyOn, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { Logger } from "../../../../src/infrastructure/logging/logger";
import { McpClientPool } from "../../../../src/infrastructure/mcp/client/pool";
import { createSettingsContext } from "../../../../src/infrastructure/configuration/settings/context";
import { createTestDirectory } from "../../../support/artifacts";
import { join } from "node:path";
import { loadMcp } from "../../../../src/infrastructure/mcp/tools/catalog";

test("MCP 清理失败保留原始工具加载错误", async () => {
  const root = createTestDirectory("mcp-cleanup"),
    initialization = new Error("工具加载原始错误"),
    cleanup = new Error("连接释放错误"),
    getClient = spyOn(McpClientPool.prototype, "getClient").mockRejectedValue(initialization),
    close = spyOn(McpClientPool.prototype, "close").mockRejectedValue(cleanup);
  mkdirSync(join(root, "settings"));
  writeFileSync(
    join(root, "settings/toolbox.yaml"),
    `
mcpServers:
  broken:
    transport: http
    url: http://broken.invalid/mcp
`,
  );
  try {
    expect(
      loadMcp(root, new Logger("error", true), createSettingsContext(root, join(root, "user"))),
    ).rejects.toMatchObject({
      errors: [expect.objectContaining({ cause: initialization }), cleanup],
    });
  } finally {
    getClient.mockRestore();
    close.mockRestore();
    rmSync(root, { force: true, recursive: true });
  }
});
