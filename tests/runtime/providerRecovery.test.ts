import { type ErrorDetails, summarizeError } from "../../src/failures/details";
import { afterEach, expect, spyOn, test } from "bun:test";
import { cleanupDatabaseDirs, required, workspace } from "../support/database";
import { providerFailures, recoveringModel, websocketFailures } from "./support/failureResponses";
import type { BrowserWarning } from "../../src/types";
import { agentFixture } from "./support/agentFixture";
import { createNetworkRuntime } from "../../src/infrastructure/network/installNetworking";
import { createResponsesWebsocketFetch } from "../../src/agent/model/responsesWebsocket";
import { generationFailures } from "./support/generationFailures";
import { isRetryableModelError } from "../../src/runtime/transientErrors";
import { processInput } from "../../src/runtime/consumeInputs";
import { reportBrowserWarning } from "../../src/app/frontend/services/events/console";
import { transcriptInputRows } from "../../src/infrastructure/database/records/execution/queue/workItems";

interface ModelFailureCase {
  errorName?: string;
  expectedError?: Partial<ErrorDetails>;
  name: string;
  response: () => Response | Promise<Response>;
  retryable: boolean;
}
const modelFailures: ModelFailureCase[] = [...providerFailures, ...generationFailures];
afterEach(cleanupDatabaseDirs);
test.each(modelFailures)("handles $name through the model graph", async (failure) => {
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
      if (failure.expectedError) {
        expect(warning.details.error).toMatchObject(failure.expectedError);
      }
      expect(isRetryableModelError(warning.details)).toBe(true);
    } else {
      expect(db.nextInput("target")?.status).toBe("paused");
      expect(loggedError).toHaveBeenCalledTimes(1);
      expect(warnings).toEqual([]);
      if (failure.expectedError) {
        const error = required(transcriptInputRows(db.db, "target").at(-1)?.error);
        expect(error).toMatchObject({ ...failure.expectedError, name: failure.errorName });
        expect(isRetryableModelError(error)).toBe(false);
      }
    }
  } finally {
    loggedError.mockRestore();
    executions.close();
    db.close();
  }
});
test.each(websocketFailures)("handles $name through the model graph", async (failure) => {
  const target = Bun.serve({
      fetch: (request, server) =>
        server.upgrade(request) ? undefined : new Response(null, { status: 404 }),
      port: 0,
      websocket: {
        message(socket) {
          if (failure.event) {
            socket.send(JSON.stringify(failure.event));
          } else {
            socket.terminate();
          }
        },
      },
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
    reportedFailures: ErrorDetails[] = [],
    loggedError = spyOn(context.logger, "error").mockReturnValue(undefined),
    loggedWarning = spyOn(console, "warn").mockReturnValue(undefined);
  globalThis.fetch = runtime.fetch;
  context.settings.model.maxConcurrentRequests = 1;
  context.settings.model.retryDelayMs = 1;
  context.observer = {
    failure: (_sessionId, error) => reportedFailures.push(error),
    token: () => undefined,
    warning: (_sessionId, warning) => warnings.push(warning),
  };
  try {
    db.resetSession("target", workspace);
    db.appendUser("target", "hello");
    await processInput(context, required(db.nextInput("target")));
    expect(model.doStreamCalls).toHaveLength(failure.retryable ? 2 : 1);
    let error: ErrorDetails;
    if (failure.retryable) {
      expect(db.history("target").at(-1)?.text).toBe("recovered");
      expect(db.nextInput("target")).toBeNull();
      expect(loggedError).not.toHaveBeenCalled();
      expect(reportedFailures).toEqual([]);
      expect(warnings).toHaveLength(1);
      const warning = required(warnings[0]);
      expect(warning.details.attempt).toBe(1);
      ({ error } = warning.details);
      reportBrowserWarning(warning);
      expect(loggedWarning).toHaveBeenCalledWith(warning.message, {
        ...warning.details,
        error: summarizeError(error),
      });
    } else {
      const paused = required(db.nextInput("target"));
      expect(paused.status).toBe("paused");
      error = required(
        transcriptInputRows(db.db, "target").find(({ id }) => id === paused.id)?.error,
      );
      expect(loggedError).toHaveBeenCalledTimes(1);
      expect(reportedFailures).toEqual([error]);
      expect(warnings).toEqual([]);
      expect(loggedWarning).not.toHaveBeenCalled();
    }
    expect(error).toMatchObject({
      cause: {
        details: failure.errorDetails,
        ...(failure.message === undefined ? {} : { message: failure.message }),
        name: failure.errorName,
      },
      name: "AI_APICallError",
    });
    expect(isRetryableModelError(error)).toBe(failure.retryable);
    const summary = summarizeError(error);
    expect(summary.causes).toHaveLength(1);
    expect(JSON.stringify(summary)).not.toContain("Unknown error");
    if (failure.message === undefined) {
      expect(required(summary.causes?.[0])).not.toHaveProperty("message");
    } else {
      expect(required(summary.causes?.[0]).message).toBe(failure.message);
    }
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
