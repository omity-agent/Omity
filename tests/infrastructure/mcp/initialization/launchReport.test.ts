import { expect, test } from "bun:test";
import { failedCatalog, failingStartupPath } from "./isolatedCatalog";
import { join } from "node:path";
import { maximumMcpStderrBytes } from "../../../../settings/diagnosticPolicy";
import { mcpLoadDetailsSchema } from "../../../../src/infrastructure/mcp/failures/wireFormat";

test("a real stdio startup exit preserves structured process, stderr, and sanitized launch diagnostics", async () => {
  const secret = "diagnostic-private-token",
    { failure, root } = await failedCatalog({
      broken: {
        args: [
          failingStartupPath,
          "exit",
          "public-token-label",
          "visible-positional-value",
          "--token",
          secret,
        ],
        command: process.execPath,
        env: { MCP_TEST_SECRET: secret },
      },
    }),
    report = mcpLoadDetailsSchema.parse(failure.details),
    [entry] = report.failures;
  expect(failure.code).toBe("MCP_LOAD_FAILED");
  expect(failure.message).toBe('MCP 启动失败："broken"');
  expect(report.failures).toHaveLength(1);
  expect(structuredClone(entry)).toMatchObject({
    connection: {
      args: [
        failingStartupPath,
        "exit",
        "public-token-label",
        "visible-positional-value",
        "--token",
        "[REDACTED]",
      ],
      command: process.execPath,
      cwd: root,
      environmentKeys: ["MCP_TEST_SECRET"],
      transport: "stdio",
    },
    process: { closedByClient: false, exitCode: 37, exited: true, pid: expect.any(Number) },
    server: "broken",
    stage: "initialize",
    stderr: {
      capturedBytes: maximumMcpStderrBytes,
      discardedBytes: expect.any(Number),
      text: expect.stringContaining("fatal startup failure: [REDACTED]"),
    },
  });
  expect(entry!.stderr!.discardedBytes).toBeGreaterThan(0);
  expect(entry!.durationMs).toBeGreaterThanOrEqual(0);
  expect(entry!.error.message).not.toBe("");
  expect(JSON.stringify(failure)).not.toContain(secret);
}, 10_000);
test("a missing executable is distinguished from an initialized child exiting", async () => {
  const command = join(import.meta.dir, "absent-mcp-executable"),
    { failure } = await failedCatalog({ absent: { args: [], command } }),
    [entry] = failure.details.failures;
  expect(structuredClone(entry)).toMatchObject({
    connection: { args: [], command, transport: "stdio" },
    server: "absent",
    stage: "spawn",
  });
  expect(JSON.stringify(entry)).toContain("ENOENT");
}, 10_000);
test("invalid startup configuration has structured field diagnostics without spawning a child", async () => {
  const { failure } = await failedCatalog({
    invalid: { args: [], command: 42 },
  });
  expect(failure.code).toBe("MCP_LOAD_FAILED");
  expect(failure.details.failures).toHaveLength(1);
  expect(structuredClone(failure.details.failures[0])).toMatchObject({
    error: expect.objectContaining({ name: "ZodError" }),
    issues: expect.arrayContaining([expect.stringContaining("command")]),
    stage: "configuration",
  });
});
test("startup stdout remains available when the SDK ignores non-JSON output", async () => {
  const { failure } = await failedCatalog({
      malformed: { args: [failingStartupPath, "protocol"], command: process.execPath },
    }),
    [entry] = failure.details.failures;
  expect(structuredClone(entry)).toMatchObject({
    process: { exitCode: 38, exited: true },
    server: "malformed",
    stage: "initialize",
    stdout: { text: "invalid MCP JSON" },
  });
}, 10_000);
test("the transport error channel retains invalid MCP messages separately from connection closed", async () => {
  const { failure } = await failedCatalog({
      invalid: { args: [failingStartupPath, "schema"], command: process.execPath },
    }),
    [entry] = failure.details.failures;
  expect(structuredClone(entry)).toMatchObject({
    server: "invalid",
    stage: "initialize",
    transportErrors: expect.arrayContaining([expect.objectContaining({ name: "ZodError" })]),
  });
}, 10_000);
test("an HTTP handshake failure records endpoint and transport causes without leaking credentials", async () => {
  const secret = "http-private-token",
    server = Bun.serve({
      fetch: () => new Response(`access denied: ${secret}`, { status: 403 }),
      hostname: "127.0.0.1",
      port: 0,
    });
  try {
    const { failure } = await failedCatalog({
        remote: {
          headers: { Authorization: `Bearer ${secret}` },
          url: `${server.url.href}mcp?token=${secret}`,
        },
      }),
      [entry] = failure.details.failures;
    expect(structuredClone(entry)).toMatchObject({
      connection: {
        headerNames: ["Authorization"],
        transport: "http",
        url: expect.stringContaining("token=[REDACTED]"),
      },
      server: "remote",
      stage: "initialize",
    });
    expect(JSON.stringify(entry)).toContain("403");
    expect(JSON.stringify(failure)).not.toContain(secret);
  } finally {
    await server.stop(true);
  }
}, 10_000);
