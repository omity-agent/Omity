import { ApiError } from "./httpTransport";

export function reportError(error: unknown, context?: Record<string, unknown>) {
  if (error instanceof ApiError && error.details) {
    console.error(error.message, {
      ...context,
      code: error.code,
      failures: error.details.failures,
      path: error.path,
      status: error.status,
    });
  } else if (context) {
    console.error(error, context);
  } else {
    console.error(error);
  }
}
export function reportPromiseErrors(promise: Promise<unknown>) {
  void reportPromise(promise);
}
async function reportPromise(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error: unknown) {
    reportError(error);
  }
}
