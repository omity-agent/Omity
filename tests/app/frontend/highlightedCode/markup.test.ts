import { expect, test } from "bun:test";
import { highlightCode } from "../../../../src/app/frontend/components/HighlightedCode/markup";

test("keeps multiline syntax spans balanced in each virtual line", () => {
  const result = highlightCode("const value = `first\nsecond`;", "javascript");
  expect(result.lines).toHaveLength(2);
  for (const line of result.lines) {
    expect(line.match(/<span\b/gu)?.length ?? 0).toBe(line.match(/<\/span>/gu)?.length ?? 0);
  }
  expect(result.lines.join("")).toContain("hljs-string");
});
test("auto detects unknown code before splitting it into virtual lines", () => {
  const result = highlightCode("function answer() {\n  return 42;\n}");
  expect(result.language).toBeDefined();
  expect(result.lines).toHaveLength(3);
  expect(result.lines.join("")).toContain("hljs-");
});
