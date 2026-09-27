import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { cleanupDatabaseDirs, required, workspace } from "../support/database";
import { providerFailures, recoveringModel } from "./support/failureResponses";
import type { BrowserWarning } from "../../src/types";
import { agentFixture } from "./support/agentFixture";
import { isRetryableModelError } from "../../src/runtime/network";
import { processInput } from "../../src/runtime/consumeInputs";
import { waitBeforeModelRetry } from "../../src/runtime/retry";

afterEach(cleanupDatabaseDirs);
test.each(providerFailures)("handles $name through the model graph", async (failure) => {
  const model = recoveringModel(failure.response),
    { context, db, executions } = agentFixture({ model }),
    warnings: BrowserWarning[] = [],
    loggedError = spyOn(context.logger, "error").mockReturnValue(undefined);
  context.settings.model.maxConcurrentRequests = 1;
  context.settings.model.reasoning_effort = "high";
  context.settings.model.retryDelayMs = 1;
  context.settings.model.temperature = undefined;
  context.observer = {
    token: () => undefined,
    warning: (_sessionId, warning) => warnings.push(warning),
  };
  try {
    db.resetSession("target", workspace);
    db.appendUser("target", "hello");
    await processInput(context, required(db.nextInput("target")));
    expect(model.doStreamCalls).toHaveLength(failure.retryable ? 2 : 1);
    if (failure.retryable) {
      expect(db.nextInput("target")).toBeNull();
      expect(db.history("target").at(-1)?.text).toBe("recovered");
      expect(loggedError).not.toHaveBeenCalled();
      expect(warnings).toHaveLength(1);
      const warning = required(warnings[0]);
      expect(warning).toMatchObject({
        code: "model_api_unavailable",
        details: { attempt: 1 },
      });
      if (failure.errorName) {
        expect(warning.details).toMatchObject({ error: { name: failure.errorName } });
      }
      expect(isRetryableModelError(warning.details)).toBe(true);
    } else {
      expect(db.nextInput("target")?.status).toBe("paused");
      expect(loggedError).toHaveBeenCalledTimes(1);
      expect(warnings).toEqual([]);
    }
  } finally {
    loggedError.mockRestore();
    executions.close();
    db.close();
  }
});
test("model retry warnings are sent to the browser observer", async () => {
  const terminalWarning = spyOn(console, "warn").mockReturnValue(undefined),
    activity = mock(),
    warnings: unknown[] = [],
    ctx = {
      controller: new AbortController(),
      db: { control: () => "running" as const },
      observer: {
        activity,
        warning: (_sessionId: string, warning: unknown) => warnings.push(warning),
      },
      sessionId: "session",
      settings: { model: { retryDelayMs: 1 } },
      wake: (delayMs: number) => {
        expect(activity).toHaveBeenCalledWith("session", "waiting");
        return Bun.sleep(delayMs);
      },
    };
  try {
    await waitBeforeModelRetry(ctx, { items: [{ id: 7 }] }, new Error("upstream unavailable"), 2, {
      cancel: async () => undefined,
      pause: async () => true,
      stop: () => undefined,
    });
  } finally {
    terminalWarning.mockRestore();
  }
  expect(terminalWarning).not.toHaveBeenCalled();
  expect(activity).toHaveBeenCalledTimes(1);
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toMatchObject({
    code: "model_api_unavailable",
    details: {
      attempt: 2,
      delayMs: 1,
      error: { message: "upstream unavailable", name: "Error" },
      inputId: 7,
      sessionId: "session",
    },
    message: "模型 API 暂不可用，正在重试",
  });
});
