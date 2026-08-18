import { expect, test } from "bun:test";
import { createCodeHighlighter } from "../../../../src/app/frontend/components/HighlightedCode/markup";

test("keeps multiline Shiki spans balanced in each virtual line", async () => {
  const highlighter = createCodeHighlighter(() => Promise.resolve("typescript")),
    result = await highlighter.highlight({
      code: "const value = `first\nsecond`;",
      language: "javascript",
      streamId: "explicit",
    });
  expect(result.lines).toHaveLength(2);
  for (const line of result.lines) {
    expect(line.match(/<span\b/gu)?.length ?? 0).toBe(line.match(/<\/span>/gu)?.length ?? 0);
  }
  expect(result.lines.join("")).toContain("--colors-syntax-string");
});
test("uses Magika detection when the language is absent", async () => {
  let detections = 0;
  const highlighter = createCodeHighlighter(() => {
      detections += 1;
      return Promise.resolve("javascript");
    }),
    result = await highlighter.highlight({
      code: "function answer() {\n  return 42;\n}",
      streamId: "detected",
    });
  expect(result.language).toBe("javascript");
  expect(result.lines).toHaveLength(3);
  expect(result.lines.join("")).toContain("--colors-syntax-keyword");
  expect(detections).toBe(1);
});
test("continues append-only code with Shiki streaming colorization", async () => {
  let detections = 0;
  const highlighter = createCodeHighlighter(() => {
    detections += 1;
    return Promise.resolve("javascript");
  });
  await highlighter.highlight({
    code: "const value = `first",
    streamId: "streaming",
  });
  const result = await highlighter.highlight({
    code: "const value = `first\nsecond`;",
    streamId: "streaming",
  });
  expect(result.lines).toHaveLength(2);
  expect(result.lines[1]).toContain("--colors-syntax-string");
  expect(detections).toBe(1);
});
