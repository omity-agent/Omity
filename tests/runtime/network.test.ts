import {
  ModelEmptyResponseError,
  isRetryableModelError,
  modelRetryDelayMs,
} from "../../src/runtime/network";
import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, required, workspace } from "../support/database";
import { AIMessage } from "@langchain/core/messages";
import type { AgentDatabase } from "../../src/infrastructure/database/agentDatabase";
import { BunSqliteSaver } from "../../src/checkpointer";
import { HookRuntime } from "../../src/hooks/runtime";
import type { HostContext } from "../../src/runtime/context";
import { Logger } from "../../src/infrastructure/logging/logger";
import type { QueueItem } from "../../src/types";
import { buildModel } from "../../src/agent/model";
import { captureError } from "../../src/failures/details";
import { createAgentGraph } from "../../src/agent";
import { fakeModel } from "@langchain/core/testing";
import { parseModelSettings } from "../../src/infrastructure/configuration/settings/schema";
import { processQueue } from "../../src/runtime/queue";
import { testSettings } from "../support/settings";
import { waitBeforeModelRetry } from "../../src/runtime/retry";

afterEach(cleanupDatabaseDirs);
test("detects retryable model errors", () => {
  expect(isRetryableModelError(new TypeError("fetch failed"))).toBe(true);
  expect(isRetryableModelError({ code: "ECONNRESET" })).toBe(true);
  expect(isRetryableModelError({ name: "TimeoutError" })).toBe(true);
  expect(isRetryableModelError({ cause: { code: "ENOTFOUND" } })).toBe(true);
  expect(isRetryableModelError({ code: "stream_read_error" })).toBe(true);
  expect(isRetryableModelError(new ModelEmptyResponseError())).toBe(true);
  expect(isRetryableModelError({ code: "server_is_overloaded" })).toBe(true);
  expect(
    isRetryableModelError({
      error: {
        details: { code: "server_is_overloaded" },
        error: { code: "server_is_overloaded" },
        type: "service_unavailable_error",
      },
    }),
  ).toBe(true);
  expect(isRetryableModelError({ name: "AbortError" })).toBe(false);
});
test("does not guess network failures from broad error messages", () => {
  expect(isRetryableModelError(new Error("fetch failed"))).toBe(false);
  expect(isRetryableModelError(new Error("network policy rejected request"))).toBe(false);
  expect(isRetryableModelError(new Error("Unexpected EOF"))).toBe(false);
  expect(isRetryableModelError(new Error("Received empty response from chat model call."))).toBe(
    false,
  );
});
test("model retry delay grows with a cap", () => {
  expect(modelRetryDelayMs(1)).toBe(1000);
  expect(modelRetryDelayMs(2)).toBe(2000);
  expect(modelRetryDelayMs(99)).toBe(30_000);
});
test("model clients disable dependency network retries", () => {
  const previousKey = process.env["TEST_KEY"];
  process.env["TEST_KEY"] = "test-key";
  try {
    const model = buildModel(testSettings("data"), "session-1");
    const retrySettings = readRetrySettings(model);
    expect(retrySettings.callerMaxRetries).toBe(0);
    expect(retrySettings.clientMaxRetries).toBe(0);
  } finally {
    if (previousKey === undefined) {
      Reflect.deleteProperty(process.env, "TEST_KEY");
    } else {
      process.env["TEST_KEY"] = previousKey;
    }
  }
});
test("model settings reject dependency retry configuration", () => {
  expect(() =>
    parseModelSettings({
      adapter: "codex",
      maxRetries: 1,
      model: "test",
      timeoutMs: 1000,
    }),
  ).toThrow("Unrecognized key");
});
test("overloaded model stream retries and completes the queue", async () => {
  const warn = spyOn(console, "warn").mockReturnValue(undefined);
  const db = makeDb();
  db.resetSession("session-1", workspace);
  db.appendUser("session-1", "重试输入");
  const item = required(db.nextQueue("session-1"));
  const final = new AIMessage({ content: "done", id: "final" });
  const context = retryContext(db, new AbortController());
  let attempts = 0;
  Object.assign(context.graph, {
    getState: () =>
      Promise.resolve({
        next: [],
        tasks: [],
        values: {
          hookPlan: { finalMessageId: "final", kind: "done" },
          messages: [...db.history("session-1"), final],
        },
      }),
    stream: () => {
      attempts += 1;
      if (attempts === 1) {
        const error = {
          error: {
            details: { code: "server_is_overloaded" },
            error: { code: "server_is_overloaded" },
            type: "service_unavailable_error",
          },
        };
        return {
          [Symbol.asyncIterator]() {
            return {
              next: async () => {
                throw error;
              },
            };
          },
        };
      }
      return [];
    },
  });
  context.wake = () => Promise.resolve();
  try {
    await processQueue(context, item);
    expect(attempts).toBe(2);
    expect(db.queueStatus(item.id)).toBe("done");
    expect(warn).toHaveBeenCalledTimes(1);
  } finally {
    warn.mockRestore();
    db.close();
  }
});
test("warns on every retryable model error even when the host is stopping", async () => {
  const warn = spyOn(console, "warn").mockReturnValue(undefined);
  const stop = mock(() => undefined);
  const controller = new AbortController();
  controller.abort();
  const db = makeDb();
  const error = { code: "stream_read_error" };
  const item: QueueItem = {
    content: "test",
    id: 42,
    root: true,
    runId: null,
    status: "running",
    userMessageId: 1,
  };
  try {
    const shouldRetry = await waitBeforeModelRetry(
      retryContext(db, controller),
      { items: [item] },
      error,
      1,
      {
        cancel: () => Promise.resolve(),
        pause: () => Promise.resolve(false),
        stop,
      },
    );
    expect(shouldRetry).toBe(false);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("模型 API 暂时不可用，将继续重试", {
      attempt: 1,
      delayMs: 1000,
      error: captureError(error),
      queueId: 42,
    });
  } finally {
    warn.mockRestore();
    db.close();
  }
});
function readRetrySettings(value: unknown) {
  if (!isRecord(value) || !isRecord(value["caller"]) || !isRecord(value["clientConfig"])) {
    throw new Error("模型客户端缺少重试配置");
  }
  const callerMaxRetries = value["caller"]["maxRetries"];
  const clientMaxRetries = value["clientConfig"]["maxRetries"];
  if (typeof callerMaxRetries !== "number" || typeof clientMaxRetries !== "number") {
    throw new Error("模型客户端重试配置不是数字");
  }
  return { callerMaxRetries, clientMaxRetries };
}
function retryContext(db: AgentDatabase, controller: AbortController): HostContext {
  const settings = testSettings(workspace);
  const logger = new Logger("error", true);
  const checkpointer = new BunSqliteSaver(db.db, "session-1");
  const hooks = new HookRuntime([], [], db.db, logger, "session-1", workspace);
  const graph = createAgentGraph({ checkpointer, hooks, model: fakeModel(), settings, tools: [] });
  return { checkpointer, controller, db, graph, logger, sessionId: "session-1", settings };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
