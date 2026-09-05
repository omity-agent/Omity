import { afterEach, expect, mock, test } from "bun:test";
import type { HighlightResult } from "../../../../src/app/frontend/components/HighlightedCode/background/tokenization";
import { HighlightScheduler } from "../../../../src/app/frontend/components/HighlightedCode/background/dispatch";
import { highlightChannel } from "../../../../src/app/frontend/components/HighlightedCode/background/channel";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});
function fixture() {
  const pending = new Map<string, ReturnType<typeof Promise.withResolvers<HighlightResult>>>(),
    started = new Map<string, ReturnType<typeof Promise.withResolvers<string[]>>>(),
    completed = new Map<string, ReturnType<typeof Promise.withResolvers<void>>>(),
    calls: string[] = [],
    called = (code: string) => {
      if (!started.has(code)) {
        started.set(code, Promise.withResolvers<string[]>());
      }
      return started.get(code)!;
    },
    done = (code: string) => {
      if (!completed.has(code)) {
        completed.set(code, Promise.withResolvers<void>());
      }
      return completed.get(code)!;
    },
    results = mock((result: { code: string }) => done(result.code).resolve()),
    errors = mock(),
    connections: { close: (error: Error) => void }[] = [],
    connect = mock(() => {
      const { port1, port2 } = new MessageChannel(),
        server = highlightChannel(port1, {
          highlight: ({ code }) => {
            calls.push(code);
            const deferred = Promise.withResolvers<HighlightResult>();
            pending.set(code, deferred);
            called(code).resolve([...calls]);
            return deferred.promise;
          },
          release: (streamId) => {
            calls.push(`release:${streamId}`);
            called(`release:${streamId}`).resolve([...calls]);
          },
        }),
        rpc = highlightChannel(port2),
        close = (error: Error) => {
          rpc.$close(error);
          server.$close();
          port1.close();
          port2.close();
        };
      port1.start();
      port2.start();
      connections.push({ close });
      cleanups.push(() => close(new Error("test closed")));
      return { close, rpc };
    }),
    scheduler = new HighlightScheduler(connect),
    schedule = (code: string, streamId = code) =>
      scheduler.schedule({ code, streamId }, results, errors),
    finish = (code: string) => {
      const deferred = pending.get(code);
      if (!deferred) {
        throw new Error(`Task not started: ${code}`);
      }
      deferred.resolve({ language: "text", lines: [code] });
    };
  cleanups.push(() => scheduler.dispose());
  return {
    called: (code: string) => called(code).promise,
    calls,
    connect,
    connections,
    done: (code: string) => done(code).promise,
    errors,
    finish,
    pending,
    results,
    schedule,
    scheduler,
  };
}
test("serializes work, prioritizes newest jobs and skips canceled pending jobs", async () => {
  const state = fixture();
  state.schedule("first");
  expect(await state.called("first")).toEqual(["first"]);
  const cancel = state.schedule("obsolete");
  state.schedule("older");
  state.schedule("newest");
  cancel();
  state.finish("first");
  expect(await state.called("newest")).toEqual(["first", "newest"]);
  state.finish("newest");
  expect(await state.called("older")).toEqual(["first", "newest", "older"]);
  state.finish("older");
  await state.done("older");
  expect(state.results).toHaveBeenCalledTimes(3);
  expect(state.errors).not.toHaveBeenCalled();
});
test("canceling active work suppresses its result without terminating cached worker state", async () => {
  const state = fixture(),
    cancel = state.schedule("active");
  expect(await state.called("active")).toEqual(["active"]);
  cancel();
  state.schedule("next");
  state.finish("active");
  expect(await state.called("next")).toEqual(["active", "next"]);
  expect(state.results).not.toHaveBeenCalled();
  expect(state.connect).toHaveBeenCalledTimes(1);
  state.finish("next");
  await state.done("next");
  expect(state.results).toHaveBeenCalledTimes(1);
});
test("release cancels obsolete work and a new render cancels a pending release", async () => {
  const state = fixture();
  state.schedule("active");
  expect(await state.called("active")).toEqual(["active"]);
  state.schedule("obsolete", "stream");
  state.scheduler.release("stream", state.errors);
  state.schedule("remounted", "stream");
  state.finish("active");
  expect(await state.called("remounted")).toEqual(["active", "remounted"]);
  state.scheduler.release("stream", state.errors);
  state.finish("remounted");
  expect(await state.called("release:stream")).toEqual(["active", "remounted", "release:stream"]);
  expect(state.errors).not.toHaveBeenCalled();
});
test("a closed connection rejects active work and queued work gets a new worker", async () => {
  const state = fixture();
  state.schedule("active");
  expect(await state.called("active")).toEqual(["active"]);
  state.schedule("next");
  state.connections[0]!.close(new Error("worker crashed"));
  expect(await state.called("next")).toEqual(["active", "next"]);
  expect(state.errors).toHaveBeenCalledTimes(1);
  expect(state.errors.mock.calls[0]![0]).toHaveProperty("message", "worker crashed");
  expect(state.connect).toHaveBeenCalledTimes(2);
  state.finish("next");
  await state.done("next");
  expect(state.results).toHaveBeenCalledTimes(1);
});
test("a remote task failure reports an error and leaves the worker reusable", async () => {
  const state = fixture();
  state.schedule("invalid");
  expect(await state.called("invalid")).toEqual(["invalid"]);
  state.schedule("next");
  state.pending.get("invalid")!.reject(new Error("invalid input"));
  expect(await state.called("next")).toEqual(["invalid", "next"]);
  expect(state.errors.mock.calls[0]![0]).toHaveProperty("message", "invalid input");
  expect(state.connect).toHaveBeenCalledTimes(1);
  state.finish("next");
  await state.done("next");
  expect(state.results).toHaveBeenCalledTimes(1);
});
test("disposing suppresses late results and clears pending work", async () => {
  const state = fixture();
  state.schedule("active");
  expect(await state.called("active")).toEqual(["active"]);
  state.schedule("never");
  state.scheduler.dispose();
  state.finish("active");
  await Bun.sleep(10);
  expect(state.calls).toEqual(["active"]);
  expect(state.results).not.toHaveBeenCalled();
  expect(state.errors).not.toHaveBeenCalled();
});
