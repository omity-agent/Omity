import { defaultBuiltIns, writeToolboxConfiguration } from "../../../support/builtins";
import { mkdirSync, rmSync } from "node:fs";
import { AskUserRuntime } from "../../../../src/infrastructure/toolbox/runtime";
import type { McpConfiguration } from "../../../../src/infrastructure/mcp/configuration";
import { createAppMcp } from "../../../../src/app/runtime/resources/toolPool";
import { createServer } from "node:http";
import { createSettingsContext } from "../../../../src/infrastructure/configuration/settings/context";
import { createTestDirectory } from "../../../support/artifacts";
import { join } from "node:path";
import { once } from "node:events";
import { promisify } from "node:util";
import { raceSignal } from "race-signal";

interface StartupCheckpoint {
  reached: PromiseWithResolvers<void>;
  response: PromiseWithResolvers<{ failure?: string }>;
}
export async function coordinateStartup(declarations: McpConfiguration["mcpServers"]) {
  const root = createTestDirectory("parallel-mcp-startup"),
    processes = new Map<string, number>(),
    checkpoints = new Map<string, StartupCheckpoint>(
      Object.keys(declarations).flatMap((name) =>
        ["boot", "tools", "listed"].map(
          (phase) =>
            [
              `/${name}/${phase}`,
              {
                reached: Promise.withResolvers<void>(),
                response: Promise.withResolvers<{ failure?: string }>(),
              },
            ] as const,
        ),
      ),
    ),
    server = createServer(async (request, response) => {
      const url = new URL(request.url!, "http://127.0.0.1"),
        checkpoint = checkpoints.get(url.pathname);
      if (!checkpoint) {
        response.writeHead(404).end("未知测试同步点");
        return;
      }
      processes.set(url.pathname.split("/")[1]!, Number(url.searchParams.get("pid")));
      checkpoint.reached.resolve();
      const { failure } = await checkpoint.response.promise;
      response.writeHead(failure ? 500 : 200).end(failure);
    });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("MCP 测试协调服务器没有 TCP 地址");
  }
  const endpoint = `http://127.0.0.1:${address.port.toString()}`,
    mcpServers = Object.fromEntries(
      Object.entries(declarations).map(([name, configuration]) => [
        name,
        {
          args: [join(import.meta.dir, "gatedStdioServer.ts"), endpoint, name],
          command: process.execPath,
          ...configuration,
        },
      ]),
    );
  for (const name of Object.keys(declarations)) {
    checkpoints.get(`/${name}/listed`)!.response.resolve({});
  }
  mkdirSync(join(root, "settings"));
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
  const context = createSettingsContext(root, join(root, "user-settings")),
    mcp = createAppMcp(root, "error", context, new AskUserRuntime(() => undefined));
  function releaseAll() {
    for (const checkpoint of checkpoints.values()) {
      checkpoint.response.resolve({});
    }
  }
  return {
    async dispose(loading: Promise<unknown>) {
      releaseAll();
      try {
        await loading;
        await mcp.close();
      } finally {
        server.closeAllConnections();
        await promisify(server.close.bind(server))();
        rmSync(root, { force: true, recursive: true });
      }
    },
    mcp,
    processes,
    release(name: string, phase: string, failure?: string) {
      checkpoints.get(`/${name}/${phase}`)!.response.resolve({ failure });
    },
    releaseAll,
    root,
    wait(name: string, phase: string) {
      return raceSignal(
        checkpoints.get(`/${name}/${phase}`)!.reached.promise,
        AbortSignal.timeout(5000),
      );
    },
  };
}
