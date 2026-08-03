const terminalSuppressedErrors = new WeakSet<object>();

export function suppressTerminalError<T extends Error>(error: T): T {
  terminalSuppressedErrors.add(error);
  return error;
}
export function isTerminalErrorSuppressed(error: unknown) {
  return isObject(error) && terminalSuppressedErrors.has(error);
}
function isObject(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}
