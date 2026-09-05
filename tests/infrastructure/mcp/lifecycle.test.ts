import { type LoadedMcp, loadServerTools } from "../../../src/infrastructure/mcp/tools/catalog";
import { expect, mock, test } from "bun:test";
import { AppMcp } from "../../../src/app/runtime/mcp";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { emptyMcpConfiguration } from "../../../src/infrastructure/mcp/configuration";
import { emptyMcpToolSnapshot } from "../../../src/infrastructure/mcp/tools/definitions";

test("MCP adapter clients initialize sequentially", async () => {
  const firstReady = Promise.withResolvers<void>(),
    requested: string[] = [],
    loading = loadServerTools(
      {
        async getClient(name) {
          requested.push(name);
          if (name === "first") {
            await firstReady.promise;
          }
          return toolClient(name);
        },
      },
      ["first", "second"],
    );
  await Bun.sleep(0);
  expect(requested).toEqual(["first"]);
  firstReady.resolve();
  expect(await loading).toHaveLength(2);
  expect(requested).toEqual(["first", "second"]);
});
test("all App consumers share one MCP lifecycle", async () => {
  const initialized = Promise.withResolvers<LoadedMcp>(),
    close = mock(() => Promise.resolve()),
    initialize = mock(() => initialized.promise),
    mcp = new AppMcp(initialize),
    first = mcp.load([]),
    second = mcp.load([]),
    closing = mcp.close();
  expect(first).toBe(second);
  expect(initialize).toHaveBeenCalledTimes(1);
  expect(close).not.toHaveBeenCalled();
  initialized.resolve(loadedMcp(close));
  await Promise.all([first, second, closing]);
  await mcp.close();
  expect(close).toHaveBeenCalledTimes(1);
  expect(mcp.load([])).rejects.toThrow("App 正在关闭");
});
test("a failed App MCP initialization can be retried", async () => {
  const close = mock(() => Promise.resolve());
  let attempts = 0;
  const mcp = new AppMcp(() => {
    attempts += 1;
    return attempts === 1
      ? Promise.reject(new Error("initialization failed"))
      : Promise.resolve(loadedMcp(close));
  });
  expect(mcp.load([])).rejects.toThrow("initialization failed");
  expect(await mcp.load([])).toEqual(expect.objectContaining({ close }));
  expect(attempts).toBe(2);
  await mcp.close();
});
test("App MCP lifecycles are isolated by ordered Profile selection", async () => {
  const close = mock(() => Promise.resolve()),
    initialize = mock((_profiles: string[]) => Promise.resolve(loadedMcp(close))),
    mcp = new AppMcp(initialize),
    first = await mcp.load(["base", "work"]),
    shared = await mcp.load(["base", "work"]),
    reordered = await mcp.load(["work", "base"]);
  expect(first).toBe(shared);
  expect(reordered).not.toBe(first);
  expect(initialize).toHaveBeenCalledTimes(2);
  await mcp.close();
  expect(close).toHaveBeenCalledTimes(2);
});
test("new App sessions receive independent MCP lifecycles", async () => {
  const close = mock(() => Promise.resolve()),
    initialize = mock(() => Promise.resolve(loadedMcp(close))),
    initializeSnapshot = mock(() => Promise.resolve(loadedMcp(close))),
    mcp = new AppMcp(initialize, initializeSnapshot),
    first = await mcp.createSession("first", ["work"], "/workspaces/first"),
    second = await mcp.createSession("second", ["work"], "/workspaces/second");
  expect(first).not.toBe(second);
  expect(
    await mcp.loadSession("first", ["work"], emptyMcpToolSnapshot(), "/workspaces/first"),
  ).toBe(first);
  expect(initialize).toHaveBeenCalledTimes(2);
  expect(initialize).toHaveBeenNthCalledWith(1, ["work"], "/workspaces/first");
  expect(initialize).toHaveBeenNthCalledWith(2, ["work"], "/workspaces/second");
  await mcp.discardSession("first");
  const reloaded = await mcp.loadSession(
    "first",
    ["work"],
    emptyMcpToolSnapshot(),
    "/workspaces/first",
  );
  expect(reloaded).not.toBe(first);
  expect(initializeSnapshot).toHaveBeenCalledWith(
    ["work"],
    emptyMcpToolSnapshot(),
    "/workspaces/first",
  );
  await mcp.close();
  expect(close).toHaveBeenCalledTimes(3);
});
test("App MCP closes successful lifecycles after another initialization fails", async () => {
  const close = mock(() => Promise.resolve()),
    mcp = new AppMcp((profiles) =>
      profiles[0] === "broken"
        ? Promise.reject(new Error("initialization failed"))
        : Promise.resolve(loadedMcp(close)),
    );
  await mcp.load(["ready"]);
  expect(mcp.load(["broken"])).rejects.toThrow("initialization failed");
  await mcp.close();
  expect(close).toHaveBeenCalledTimes(1);
});
function toolClient(name: string) {
  const client = new Client({ name, version: "1.0.0" });
  client.listTools = () =>
    Promise.resolve({
      tools: [
        {
          description: name,
          inputSchema: { properties: {}, type: "object" as const },
          name: "tool",
        },
      ],
    });
  return client;
}
function loadedMcp(close: LoadedMcp["close"]): LoadedMcp {
  return {
    close,
    configuration: emptyMcpConfiguration(),
    freeformToolParameters: new Map(),
    modelTools: () => [],
    tools: [],
  };
}
