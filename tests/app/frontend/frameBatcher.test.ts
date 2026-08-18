import { expect, mock, test } from "bun:test";
import { FrameBatcher } from "../../../src/app/frontend/services/scheduling/frameBatcher";

test("batches all pending values into the next animation frame", () => {
  let callback: FrameRequestCallback | undefined;
  const flush = mock((_items: number[]) => undefined),
    batcher = new FrameBatcher(
      flush,
      (next) => {
        callback = next;
        return 1;
      },
      () => undefined,
    );
  batcher.add(1);
  batcher.add(2);
  expect(flush).not.toHaveBeenCalled();
  if (callback) {
    Reflect.apply(callback, undefined, [0]);
  }
  expect(flush).toHaveBeenCalledWith([1, 2]);
});
test("cancel discards the pending frame and values", () => {
  const cancel = mock((_handle: number) => undefined),
    flush = mock((_items: number[]) => undefined),
    batcher = new FrameBatcher(flush, () => 7, cancel);
  batcher.add(1);
  batcher.cancel();
  expect(cancel).toHaveBeenCalledWith(7);
  expect(flush).not.toHaveBeenCalled();
});
