import { afterEach, expect, spyOn, test } from "bun:test";
import { cleanupDatabaseDirs, required, workspace } from "../support/database";
import { providerFailures, recoveringModel } from "./support/failureResponses";
import type { BrowserWarning } from "../../src/types";
import { agentFixture } from "./support/agentFixture";
import { createNetworkRuntime } from "../../src/infrastructure/network/installNetworking";
import { createResponsesWebsocketFetch } from "../../src/agent/model/responsesWebsocket";
import { isRetryableModelError } from "../../src/runtime/transientErrors";
import { processInput } from "../../src/runtime/consumeInputs";
import { reportBrowserWarning } from "../../src/app/frontend/services/events/delivery";
import { summarizeError } from "../../src/failures/details";

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
test("an abnormal WebSocket disconnection is retried through the model graph", async () => {
  const target = Bun.serve({
      fetch: (request, server) =>
        server.upgrade(request) ? undefined : new Response(null, { status: 404 }),
      port: 0,
      websocket: { message: (socket) => socket.terminate() },
    }),
    runtime = createNetworkRuntime(async () => undefined),
    previousFetch = globalThis.fetch,
    model = recoveringModel(() =>
      createResponsesWebsocketFetch({ apiKey: "test-key" })(new URL("/responses", target.url), {
        body: JSON.stringify({ input: [], model: "test-model" }),
        method: "POST",
      }),
    ),
    { context, db, executions } = agentFixture({ model }),
    warnings: BrowserWarning[] = [],
    loggedError = spyOn(context.logger, "error").mockReturnValue(undefined),
    loggedWarning = spyOn(console, "warn").mockReturnValue(undefined);
  globalThis.fetch = runtime.fetch;
  context.settings.model.maxConcurrentRequests = 1;
  context.settings.model.retryDelayMs = 1;
  context.observer = {
    token: () => undefined,
    warning: (_sessionId, warning) => warnings.push(warning),
  };
  try {
    db.resetSession("target", workspace);
    db.appendUser("target", "hello");
    await processInput(context, required(db.nextInput("target")));
    expect(model.doStreamCalls).toHaveLength(2);
    expect(db.history("target").at(-1)?.text).toBe("recovered");
    expect(db.nextInput("target")).toBeNull();
    expect(loggedError).not.toHaveBeenCalled();
    expect(warnings).toHaveLength(1);
    expect(required(warnings[0]).details).toMatchObject({
      attempt: 1,
      error: {
        cause: {
          details: { close: { code: 1006, wasClean: false }, phase: "stream" },
          name: "ResponsesWebsocketError",
        },
        name: "AI_APICallError",
      },
    });
    const warning = required(warnings[0]),
      summary = summarizeError(warning.details.error);
    expect(isRetryableModelError(warning.details)).toBe(true);
    expect(summary.causes).toHaveLength(1);
    expect(required(summary.causes?.[0])).not.toHaveProperty("message");
    reportBrowserWarning(warning);
    expect(loggedWarning).toHaveBeenCalledWith(warning.message, {
      ...warning.details,
      error: summary,
    });
  } finally {
    globalThis.fetch = previousFetch;
    loggedError.mockRestore();
    loggedWarning.mockRestore();
    executions.close();
    db.close();
    await runtime.close();
    await target.stop(true);
  }
});
