import { afterEach, expect, spyOn, test } from "bun:test";
import { cleanupDatabaseDirs, required, workspace } from "../support/database";
import { providerFailures, recoveringModel } from "./support/failureResponses";
import type { BrowserWarning } from "../../src/types";
import { agentFixture } from "./support/agentFixture";
import { isRetryableModelError } from "../../src/runtime/network";
import { processInput } from "../../src/runtime/consumeInputs";

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
