export function requestSignal(args: unknown[]) {
  for (const value of args.toReversed()) {
    if (isRecord(value) && value["signal"] instanceof AbortSignal) {
      return value["signal"];
    }
  }
  return undefined;
}
export function waitForSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise;
  }
  signal.throwIfAborted();
  return raceWithAbort(promise, signal);
}
export async function interruptibleDelay(milliseconds: number, signal: AbortSignal) {
  signal.throwIfAborted();
  const delayed = Promise.withResolvers<void>(),
    timer = setTimeout(() => delayed.resolve(), milliseconds),
    abort = () => {
      clearTimeout(timer);
      delayed.reject(signal.reason);
    };
  signal.addEventListener("abort", abort, { once: true });
  try {
    await delayed.promise;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}
async function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal) {
  const aborted = Promise.withResolvers<never>(),
    abort = () => aborted.reject(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  try {
    return await Promise.race([promise, aborted.promise]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
