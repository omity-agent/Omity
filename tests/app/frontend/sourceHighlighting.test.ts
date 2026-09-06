import { escape, unescape } from "es-toolkit";
import { expect, test } from "bun:test";
import { highlightMarkdownSource } from "../../../src/app/frontend/components/Markdown/syntax";

test.each(["", "\n", "\n\n", "第一行\n\n尾行\n", "**粗体\n跨行**\n"])(
  "源码高亮逐行保留空行、末尾换行和跨行标记：%j",
  (code) => {
    const result = highlightMarkdownSource(code),
      restored = result.lines.map((line) => unescape(line.replace(/<\/?span\b[^>]*>/gu, "")));
    expect(result.sourceLines).toEqual(code.split("\n"));
    expect(restored).toEqual(result.sourceLines);
    expect(restored.join("\n")).toBe(code);
    for (const line of result.lines) {
      expect(line.match(/<span /gu)?.length ?? 0).toBe(line.match(/<\/span>/gu)?.length ?? 0);
    }
  },
);
test("源码中的 HTML 和属性边界始终转义", () => {
  const code = "<script>alert(\"x\" & 'y')</script>",
    result = highlightMarkdownSource(code);
  expect(result.lines.join("")).not.toContain("<script>");
  expect(result.lines.join("").replace(/<\/?span\b[^>]*>/gu, "")).toBe(escape(code));
});
