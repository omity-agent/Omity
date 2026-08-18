import { describe, expect, test } from "bun:test";
import type { HighlightedCodeResult } from "../../../../src/app/frontend/components/HighlightedCode/scheduler";
import { retainedLineMarkup } from "../../../../src/app/frontend/components/HighlightedCode/retention";

const highlight: HighlightedCodeResult = {
  code: "const value =",
  language: "typescript",
  lines: ['<span class="hljs-keyword">const</span> value ='],
  sourceLines: ["const value ="],
};
describe("retainedLineMarkup", () => {
  test("直接复用文本一致的高亮行", () => {
    expect(
      retainedLineMarkup({
        appendOnly: false,
        current: "const value =",
        highlight,
        index: 0,
      }),
    ).toBe(highlight.lines[0]);
  });
  test("流式追加时保留旧高亮并转义新增尾部", () => {
    expect(
      retainedLineMarkup({
        appendOnly: true,
        current: "const value = <next>",
        highlight,
        index: 0,
      }),
    ).toBe(`${highlight.lines[0]} &lt;next&gt;`);
  });
  test("非追加修改不复用不匹配的高亮", () => {
    expect(
      retainedLineMarkup({
        appendOnly: false,
        current: "let value =",
        highlight,
        index: 0,
      }),
    ).toBeUndefined();
  });
});
