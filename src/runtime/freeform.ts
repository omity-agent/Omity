import { isPlainObject as isRecord } from "es-toolkit";

export function rawFreeformInput(input: unknown) {
  if (isRecord(input) && typeof input["input"] === "string") {
    return input["input"];
  }
  if (typeof input === "string") {
    return input;
  }
  throw new Error("Freeform 工具调用缺少原始字符串输入");
}
