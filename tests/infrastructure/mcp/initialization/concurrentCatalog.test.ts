import { expect, test } from "bun:test";
import { coordinateStartup } from "./startupCoordinator";
import { isProcessRunning } from "../../../../src/infrastructure/process/ownership";
import { snapshotMcpTools } from "../../../../src/infrastructure/mcp/tools/definitions";

test("session MCP pipelines overlap while preserving tool order and reusing the session pool", async () => {
  const fixture = await coordinateStartup({
      first: { defer_loading: true, excludedTools: ["hidden"] },
      second: { excludedTools: ["hidden"], prefixToolNameWithServerName: false },
      third: {},
    }),
    loading = fixture.mcp.createSession("parallel-session", [], fixture.root),
    outcome = Promise.allSettled([loading]);
  try {
    await Promise.all(["first", "second", "third"].map((name) => fixture.wait(name, "boot")));
    fixture.release("second", "boot");
    await fixture.wait("second", "tools");
    fixture.release("first", "boot");
    fixture.release("third", "boot");
    await Promise.all(["first", "third"].map((name) => fixture.wait(name, "tools")));
    for (const name of ["second", "third", "first"]) {
      fixture.release(name, "tools");
      await fixture.wait(name, "listed");
    }
    const [result] = await outcome;
    if (result.status === "rejected") {
      throw result.reason;
    }
    const loaded = result.value;
    expect(Object.keys(loaded.configuration.mcpServers)).toEqual(["first", "second", "third"]);
    expect(loaded.tools.map(({ name }) => name)).toEqual([
      "first__identity",
      "identity",
      "third__identity",
      "third__hidden",
    ]);
    expect(loaded.tools[0]!.extras?.["defer_loading"]).toBe(true);
    expect(loaded.tools[1]!.extras?.["defer_loading"]).not.toBe(true);
    expect(await loaded.tools[0]!.invoke({})).toContain(fixture.processes.get("first")!.toString());
    expect(
      await fixture.mcp.loadSession(
        "parallel-session",
        [],
        snapshotMcpTools(loaded, { cwd: fixture.root, session: fixture.root }),
        fixture.root,
      ),
    ).toBe(loaded);
    expect(fixture.processes.size).toBe(3);
    await fixture.mcp.discardSession("parallel-session");
    expect([...fixture.processes.values()].map(isProcessRunning)).toEqual([false, false, false]);
  } finally {
    await fixture.dispose(outcome);
  }
}, 15_000);
test.each([false, true])(
  "initialization failure drains other pipelines and closes all children (multiple errors: %s)",
  async (multipleErrors) => {
    const fixture = await coordinateStartup({ broken: {}, late: {}, other: {} }),
      loading = fixture.mcp.createSession("failed-session", [], fixture.root),
      outcome = Promise.allSettled([loading]);
    try {
      await Promise.all(["broken", "other", "late"].map((name) => fixture.wait(name, "boot")));
      fixture.release("broken", "boot");
      fixture.release("other", "boot");
      await Promise.all(["broken", "other"].map((name) => fixture.wait(name, "tools")));
      fixture.release("broken", "tools", "broken catalog rejected");
      await fixture.wait("broken", "listed");
      fixture.release("other", "tools", multipleErrors ? "other catalog rejected" : undefined);
      await fixture.wait("other", "listed");
      fixture.release("late", "boot");
      await fixture.wait("late", "tools");
      fixture.release("late", "tools");
      await fixture.wait("late", "listed");
      const [result] = await outcome;
      if (result.status === "fulfilled") {
        throw new Error("MCP 初始化意外成功");
      }
      const failure: unknown = result.reason;
      if (!(failure instanceof Error)) {
        throw new Error("MCP 初始化未返回 Error", { cause: failure });
      }
      expect(failure.message).toContain('MCP 服务器 "broken" 初始化失败');
      expect(failure.message).toContain("broken catalog rejected");
      if (multipleErrors) {
        expect(failure.message).toContain('MCP 服务器 "other" 初始化失败');
        expect(failure.message).toContain("other catalog rejected");
      }
      expect(fixture.processes.size).toBe(3);
      expect([...fixture.processes.values()].map(isProcessRunning)).toEqual([false, false, false]);
    } finally {
      await fixture.dispose(outcome);
    }
  },
  15_000,
);
