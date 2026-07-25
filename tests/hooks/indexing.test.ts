import { expect, test } from "bun:test";
import { isHookOutputVariable, resolveHookArgs } from "../../src/hooks/variables";

const toolOutputs = [
  {
    output: { name: "first" },
    structuredOutput: { tabs: [{ id: "tab-1" }] },
  },
  { output: "middle" },
  {
    output: "last",
    structuredOutput: { tab_id: "tab-3" },
  },
];
test("tool output variables use one-based indexes from either end", () => {
  expect(
    resolveHookArgs(
      {
        first: `\${toolOutputs.fromStart.1.output}`,
        last: `result=\${toolOutputs.fromEnd.1.output}`,
        middleFromEnd: `\${toolOutputs.fromEnd.2.output}`,
        middleFromStart: `\${toolOutputs.fromStart.2.output}`,
        nestedArray: `\${toolOutputs.fromStart.1.structuredOutput.tabs.0.id}`,
        nestedObject: `\${toolOutputs.fromEnd.1.structuredOutput.tab_id}`,
      },
      { cwd: "F:\\work", toolOutputs },
    ),
  ).toEqual({
    first: { name: "first" },
    last: "result=last",
    middleFromEnd: "middle",
    middleFromStart: "middle",
    nestedArray: "tab-1",
    nestedObject: "tab-3",
  });
});
test("tool output variable syntax is strict", () => {
  expect(isHookOutputVariable("toolOutputs.fromStart.1.output")).toBeTrue();
  expect(isHookOutputVariable("previousTool.output")).toBeFalse();
  for (const name of [
    "toolOutputs.fromStart.0.output",
    "toolOutputs.fromEnd.-1.output",
    "toolOutputs.fromStart.1.5.output",
    "toolOutputs.fromStart.one.output",
    "toolOutputs.fromMiddle.1.output",
    "toolOutputs.fromEnd.9007199254740992.output",
  ]) {
    expect(() => isHookOutputVariable(name)).toThrow("Hook 工具输出变量");
  }
});
test("tool output variables reject unavailable outputs and paths", () => {
  expect(() => resolve("toolOutputs.fromStart.4.output")).toThrow("当前共有 3 个");
  expect(() => resolve("toolOutputs.fromEnd.3.structuredOutput.tabs.2")).toThrow("字段不存在：2");
  expect(() => resolve("toolOutputs.fromEnd.2.structuredOutput")).toThrow("没有结构化输出");
  expect(() => resolve("toolOutputs.fromEnd.1.structuredOutput.missing")).toThrow(
    "字段不存在：missing",
  );
});
function resolve(name: string) {
  return resolveHookArgs({ value: `\${${name}}` }, { cwd: "F:\\work", toolOutputs });
}
