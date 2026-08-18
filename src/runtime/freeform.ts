export function rawFreeformInput(input: unknown) {
  if (isRecord(input) && typeof input["input"] === "string") {
    return input["input"];
  }
  if (typeof input === "string") {
    return input;
  }
  throw new Error("Freeform 工具调用缺少原始字符串输入");
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
