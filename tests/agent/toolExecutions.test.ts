import { expect, test } from "bun:test";
import { ToolExecutions } from "../../src/agent/toolExecutions";

test("tool cancellation survives the gap before execution begins", () => {
  const executions = new ToolExecutions();
  executions.announce("call-1");
  expect(executions.cancel("call-1")).toBe(true);
  executions.announce("call-1");
  const execution = executions.begin("call-1");
  expect(execution.signal.aborted).toBe(true);
  expect(execution.cancellationDurationMs()).toBe(0);
  expect(execution.signal.reason).toBeInstanceOf(Error);
  execution.complete();
});
test("unknown and completed tool calls cannot be cancelled", () => {
  const executions = new ToolExecutions();
  expect(executions.cancel("missing")).toBe(false);
  executions.announce("call-1");
  const execution = executions.begin("call-1");
  execution.complete();
  expect(executions.cancel("call-1")).toBe(false);
});
test("external cancellation requests are polled while a tool runs", async () => {
  const request: { at?: number } = {},
    executions = new ToolExecutions({
      cancellationRequested: () => request.at,
      pollMs: 1,
    });
  executions.announce("call-1");
  const execution = executions.begin("call-1");
  request.at = Date.now();
  await Bun.sleep(5);
  expect(execution.signal.aborted).toBe(true);
  execution.complete();
});
test("cancellation duration excludes generation and paused waiting", () => {
  let now = 100;
  const executions = new ToolExecutions({ now: () => now });
  executions.announce("call-1");
  now = 10_000;
  const execution = executions.begin("call-1");
  now = 10_250;
  executions.cancel("call-1");
  now = 20_000;
  expect(execution.cancellationDurationMs()).toBe(250);
  execution.complete();
});
test("a persisted cancellation skips execution after a restart", () => {
  const executions = new ToolExecutions({
      cancellationRequested: () => 200,
      now: () => 1000,
    }),
    execution = executions.begin("call-1");
  expect(execution.signal.aborted).toBeTrue();
  expect(execution.cancellationDurationMs()).toBe(0);
  execution.complete();
});
