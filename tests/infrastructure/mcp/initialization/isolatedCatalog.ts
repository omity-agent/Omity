import { defaultBuiltIns, writeToolboxConfiguration } from "../../../support/builtins";
import { mkdirSync, rmSync } from "node:fs";
import { Logger } from "../../../../src/infrastructure/logging/logger";
import { McpLoadError } from "../../../../src/infrastructure/mcp/failures/reportConstruction";
import { createSettingsContext } from "../../../../src/infrastructure/configuration/settings/context";
import { createTestDirectory } from "../../../support/artifacts";
import { join } from "node:path";
import { loadMcp } from "../../../../src/infrastructure/mcp/tools/catalog";

export const failingStartupPath = join(import.meta.dir, "failingStartup.ts");
export function configureFailure(root: string, mcpServers: Record<string, unknown>) {
  writeToolboxConfiguration(root, {
    mcpServers,
    stdio: { restart: { delayMs: 0, maxAttempts: 1 } },
    toolboxes: Object.fromEntries(
      Object.entries(defaultBuiltIns()).map(([name, configuration]) => [
        name,
        { ...configuration, enabled: false },
      ]),
    ),
  });
}
export async function failedCatalog(mcpServers: Record<string, unknown>) {
  const root = createTestDirectory("mcp-failure-diagnostics");
  mkdirSync(join(root, "settings"));
  configureFailure(root, mcpServers);
  try {
    const context = createSettingsContext(root, join(root, "user-settings"));
    try {
      const loaded = await loadMcp(root, new Logger("error", true), context, { cwd: root });
      await loaded.close();
    } catch (error) {
      if (error instanceof McpLoadError) {
        return { failure: error, root };
      }
      throw error;
    }
    throw new Error("MCP startup unexpectedly succeeded");
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}
