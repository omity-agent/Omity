import { AsyncLocalStorage } from "node:async_hooks";
import assert from "node:assert/strict";
import { isPromise } from "node:util/types";
import { z } from "zod";

const boundarySchema = z.object({
  mcpReturned: z.number(),
  mcpStarted: z.number(),
  modelSettled: z.number(),
  nextModel: z.number(),
  received: z.number(),
  sent: z.number(),
});
export type Boundaries = z.infer<typeof boundarySchema>;
export interface TimingSpan {
  label: string;
  start: number;
  end?: number;
  parent?: TimingSpan;
}
export class SpanRecorder {
  readonly boundaries: Partial<Boundaries> = {};
  readonly spans: TimingSpan[] = [];
  private readonly nesting = new AsyncLocalStorage<TimingSpan>();
  get active() {
    return this.boundaries.received !== undefined && this.boundaries.sent === undefined;
  }
  mark(name: keyof Boundaries, time = performance.now()) {
    assert(this.boundaries[name] === undefined, `计时边界重复：${name}`);
    this.boundaries[name] = time;
  }
  measure<Result>(label: string, operation: () => Result, after?: (end: number) => void): Result;
  measure(label: string, operation: () => unknown, after?: (end: number) => void): unknown {
    if (!this.active) {
      return operation();
    }
    const parent = this.nesting.getStore();
    if (parent?.label === label) {
      return operation();
    }
    const span: TimingSpan = { label, parent, start: performance.now() },
      finish = () => {
        span.end = performance.now();
        after?.(span.end);
      };
    this.spans.push(span);
    return this.nesting.run(span, () => {
      let result: unknown;
      try {
        result = operation();
      } catch (error) {
        finish();
        throw error;
      }
      if (isPromise(result)) {
        return finishPromise(result, finish);
      }
      finish();
      return result;
    });
  }
  complete() {
    const boundaries = boundarySchema.parse(this.boundaries),
      order = [
        boundaries.received,
        boundaries.modelSettled,
        boundaries.mcpStarted,
        boundaries.mcpReturned,
        boundaries.nextModel,
        boundaries.sent,
      ];
    for (let index = 1; index < order.length; index += 1) {
      assert(order[index]! >= order[index - 1]!, "计时边界顺序错误");
    }
    for (const span of this.spans) {
      assert(span.end !== undefined && span.end >= span.start, `计时操作未完成：${span.label}`);
    }
    return boundaries;
  }
  dispose() {
    this.nesting.disable();
  }
}
async function finishPromise(promise: Promise<unknown>, finish: () => void) {
  try {
    return await promise;
  } finally {
    finish();
  }
}
