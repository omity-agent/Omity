import { expect, test } from "bun:test";
import { formatToolInput, parseToolInput } from "../../../src/fileLinks/toolInput";
import type { DisplayToolCall } from "../../../src/app/timeline";

test.each([
  ['{"command":"echo', "command: echo"],
  ['{"options":{"timeout":10', "options:\n  timeout: 10"],
  ['{"items":[1,2,', "items:\n  - 1\n  - 2"],
  ['{"enabled":true', "enabled: true"],
])("formats an incomplete JSON prefix as YAML", (inputText, expected) => {
  expect(formatToolInput(call(parseToolInput(inputText)))).toBe(expected);
});
test.each(['{"value":tru', String.raw`{"value":"\u12`, '{"value" 1}'])(
  "rejects a non-recoverable JSON prefix without displaying raw JSON",
  (inputText) => {
    expect(parseToolInput(inputText)).toBeUndefined();
    expect(formatToolInput(call(parseToolInput(inputText)))).toBe("");
  },
);
test("uses the structured input when no streamed text is available", () => {
  expect(formatToolInput(call({ command: "pwd" }))).toBe("command: pwd");
});
test("keeps Freeform tool input unchanged", () => {
  const input = '*** Begin Patch\n+const value = "quoted";\\path\n';
  expect(formatToolInput(call({ input }, input))).toBe(input);
});
test.each([null, false, 0, ""])("preserves a valid JSON scalar: %j", (input) => {
  expect(parseToolInput(JSON.stringify(input))).toEqual(input);
  expect(formatToolInput(call(input))).not.toBe("");
});
function call(input: unknown, rawInput?: string): DisplayToolCall {
  return {
    id: "call-1",
    index: 0,
    input,
    inputTokens: 0,
    name: "shell",
    ...(rawInput === undefined ? {} : { rawInput }),
  };
}
