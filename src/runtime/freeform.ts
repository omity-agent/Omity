import { isPlainObject as isRecord } from "es-toolkit";
import { localize } from "../i18n/server";

export function trimFreeformInput(input: string) {
  const contentEnd = input.trimEnd().length;
  if (contentEnd === 0) {
    return "";
  }
  const lineBreak = input.slice(contentEnd).search(/[\r\n\u2028\u2029]/u);
  return lineBreak === -1 ? input : input.slice(0, contentEnd + lineBreak);
}
export function rawFreeformInput(input: unknown) {
  if (isRecord(input) && typeof input["input"] === "string") {
    return input["input"];
  }
  if (typeof input === "string") {
    return input;
  }
  throw new Error(localize("runtime:tool.freeformInputMissing"));
}
