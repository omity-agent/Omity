import { expect, mock, test } from "bun:test";
import { FrameBatcher } from "../../../src/app/frontend/services/scheduling/frameBatcher";

function requestFrameSeven(this: typeof globalThis, _callback: FrameRequestCallback) {
  expect(this).toBe(globalThis);
  return 7;
}
function checkedCancelAnimationFrame(this: typeof globalThis, handle: number) {
  expect(this).toBe(globalThis);
  expect(handle).toBe(7);
}
test("batches all pending values into the next animation frame", () => {
  const previousRequest = globalThis.requestAnimationFrame,
    previousCancel = globalThis.cancelAnimationFrame;
  let callback: FrameRequestCallback | undefined;
  globalThis.requestAnimationFrame = function requestAnimationFrame(next) {
    expect(this).toBe(globalThis);
    callback = next;
    return 1;
  };
  globalThis.cancelAnimationFrame = () => undefined;
  try {
    const flush = mock((_items: number[]) => undefined),
      batcher = new FrameBatcher(flush);
    batcher.add(1);
    batcher.add(2);
    expect(flush).not.toHaveBeenCalled();
    if (callback) {
      Reflect.apply(callback, undefined, [0]);
    }
    expect(flush).toHaveBeenCalledWith([1, 2]);
  } finally {
    globalThis.requestAnimationFrame = previousRequest;
    globalThis.cancelAnimationFrame = previousCancel;
  }
});
test("cancel discards the pending frame and values", () => {
  const previousRequest = globalThis.requestAnimationFrame,
    previousCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = requestFrameSeven;
  globalThis.cancelAnimationFrame = checkedCancelAnimationFrame;
  try {
    const flush = mock((_items: number[]) => undefined),
      batcher = new FrameBatcher(flush);
    batcher.add(1);
    batcher.cancel();
    expect(flush).not.toHaveBeenCalled();
  } finally {
    globalThis.requestAnimationFrame = previousRequest;
    globalThis.cancelAnimationFrame = previousCancel;
  }
});
