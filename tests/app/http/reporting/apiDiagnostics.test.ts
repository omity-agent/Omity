import {
  configureFailure,
  failingStartupPath,
} from "../../../infrastructure/mcp/initialization/isolatedCatalog";
import { expect, spyOn, test } from "bun:test";
import { ApiError } from "../../../../src/app/frontend/services/httpTransport";
import { createSession } from "../../../../src/app/frontend/services/client";
import { liveApplication } from "../liveApplication";
import { reportError } from "../../../../src/app/frontend/services/errors";

test("MCP startup diagnostics survive the API and are reported as one summary and a structured browser record", async () => {
  await using app = await liveApplication();
  configureFailure(app.root, {
    broken: {
      args: [failingStartupPath, "exit"],
      command: process.execPath,
    },
  });
  const originalFetch = globalThis.fetch,
    replacement = Object.assign(
      (input: RequestInfo | URL, init?: RequestInit) =>
        originalFetch(typeof input === "string" ? new URL(input, app.url) : input, init),
      { preconnect: originalFetch.preconnect },
    ),
    fetcher = spyOn(globalThis, "fetch").mockImplementation(replacement),
    logged = spyOn(console, "error").mockReturnValue(undefined);
  try {
    let failure: unknown;
    try {
      await createSession(app.root, undefined, { history: [], message: "start a session" }, []);
    } catch (error) {
      failure = error;
    }
    expect(logged).not.toHaveBeenCalled();
    expect(failure).toBeInstanceOf(ApiError);
    if (!(failure instanceof ApiError)) {
      throw failure;
    }
    expect(failure.code).toBe("MCP_LOAD_FAILED");
    expect(failure.message).toBe('MCP 启动失败："broken"');
    expect(failure.status).toBe(500);
    expect(structuredClone(failure.details)).toMatchObject({
      failures: [
        expect.objectContaining({
          process: expect.objectContaining({ exitCode: 37 }),
          server: "broken",
          stage: "initialize",
        }),
      ],
    });
    reportError(failure);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith(
      'MCP 启动失败："broken"',
      expect.objectContaining({
        code: "MCP_LOAD_FAILED",
        failures: [
          expect.objectContaining({
            connection: expect.objectContaining({ cwd: app.root, transport: "stdio" }),
            stderr: expect.objectContaining({
              text: expect.stringContaining("fatal startup failure"),
            }),
          }),
        ],
        status: 500,
      }),
    );
  } finally {
    fetcher.mockRestore();
    logged.mockRestore();
  }
}, 15_000);
