import { expect, mock, test } from "bun:test";
import { Client } from "@modelcontextprotocol/client";
import { Logger } from "../../../src/infrastructure/logging/logger";
import { RestartingStdioClient } from "../../../src/infrastructure/mcp/client/restarting";
import { requestSignal } from "../../../src/infrastructure/mcp/client/requestPolicy";

test("canceling a waiter preserves the reason without canceling shared MCP recovery", async () => {
  const first = connection(),
    recovered = connection(),
    connecting = Promise.withResolvers<void>(),
    next = Promise.withResolvers<ReturnType<typeof connection>>(),
    controller = new AbortController(),
    reason = new Error("request canceled"),
    connect = mock(() => {
      if (connect.mock.calls.length === 1) {
        return Promise.resolve(first);
      }
      connecting.resolve();
      return next.promise;
    }),
    client = await RestartingStdioClient.create(
      "cancel-waiter",
      { args: [], command: "test" },
      { delayMs: 0, maxAttempts: 2 },
      new Logger("error", true),
      connect,
    );
  try {
    await first.close();
    await connecting.promise;
    const canceled = client.listTools({ signal: controller.signal }),
      waiting = client.listTools();
    controller.abort(reason);
    expect(canceled).rejects.toBe(reason);
    next.resolve(recovered);
    expect(await waiting).toEqual({ tools: [] });
    expect(connect).toHaveBeenCalledTimes(2);
    expect(await client.listTools()).toEqual({ tools: [] });
  } finally {
    next.resolve(recovered);
    await client.close();
  }
});
test("closing MCP interrupts a long restart backoff", async () => {
  const first = connection(),
    failed = Promise.withResolvers<void>(),
    connect = mock(() => {
      if (connect.mock.calls.length === 1) {
        return Promise.resolve(first);
      }
      failed.resolve();
      return Promise.reject(new Error("connect failed"));
    }),
    client = await RestartingStdioClient.create(
      "cancel-backoff",
      { args: [], command: "test" },
      { delayMs: 60_000, maxAttempts: 3 },
      new Logger("error", true),
      connect,
    );
  await first.close();
  await failed.promise;
  await Bun.sleep(0);
  await client.close();
  expect(connect).toHaveBeenCalledTimes(2);
});
test("request signals are selected from the last matching options without modifying arguments", () => {
  const first = new AbortController().signal,
    last = new AbortController().signal,
    args = Object.freeze([{ signal: first }, null, { signal: "invalid" }, { signal: last }]);
  expect(requestSignal([...args])).toBe(last);
  expect(requestSignal([null, {}, { signal: "invalid" }])).toBeUndefined();
});
function connection() {
  const closed = Promise.withResolvers<void>(),
    client = new Client({ name: "cancel-test", version: "1" });
  let exited = false;
  client.listTools = () => Promise.resolve({ tools: [] });
  return {
    client,
    close: () => {
      exited = true;
      closed.resolve();
      return Promise.resolve();
    },
    closed: closed.promise,
    diagnostics: () => "",
    isClosed: () => exited,
  };
}
