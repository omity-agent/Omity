import { expect, test } from "bun:test";
import type { DisplayToolCall } from "../../../src/app/timeline";
import { formatToolInput } from "../../../src/fileLinks/toolInput";

test.each([
  ['{"command":"echo', "command: echo"],
  ['{"options":{"timeout":10', "options:\n  timeout: 10"],
  ['{"items":[1,2,', "items:\n  - 1\n  - 2"],
  ['{"enabled":true', "enabled: true"],
])("formats an incomplete JSON prefix as YAML", (inputText, expected) => {
  expect(formatToolInput(call(inputText))).toBe(expected);
});
test.each(['{"value":tru', String.raw`{"value":"\u12`, '{"value" 1}'])(
  "keeps a non-recoverable JSON prefix as text",
  (inputText) => {
    expect(formatToolInput(call(inputText))).toBe(`'${inputText}'`);
  },
);
test("uses the structured input when no streamed text is available", () => {
  expect(formatToolInput(call(undefined, { command: "pwd" }))).toBe("command: pwd");
});
test("keeps Freeform tool input unchanged", () => {
  const input = '*** Begin Patch\n+const value = "quoted";\\path\n';
  expect(formatToolInput(call(undefined, { input }, input))).toBe(input);
});
function call(inputText?: string, input: unknown = {}, rawInput?: string): DisplayToolCall {
  return {
    id: "call-1",
    index: 0,
    input,
    inputText,
    inputTokens: 0,
    name: "shell",
    ...(rawInput === undefined ? {} : { rawInput }),
  };
}
