import { expect, spyOn, test } from "bun:test";
import { waitBeforeModelRetry } from "../../src/runtime/retry";

test("model retry warnings are sent to the browser observer", async () => {
  const terminalWarning = spyOn(console, "warn").mockReturnValue(undefined);
  const warnings: unknown[] = [];
  const ctx = {
    controller: new AbortController(),
    db: { control: () => "running" as const },
    observer: { warning: (_sessionId: string, warning: unknown) => warnings.push(warning) },
    sessionId: "session",
    settings: { model: { retryDelayMs: 1 } },
    wake: (delayMs: number) => Bun.sleep(delayMs),
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
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toMatchObject({
    code: "model_api_unavailable",
    details: {
      attempt: 2,
      delayMs: 1,
      error: { message: "upstream unavailable", name: "Error" },
      queueId: 7,
      sessionId: "session",
    },
    message: "模型 API 暂不可用，正在重试",
  });
});
