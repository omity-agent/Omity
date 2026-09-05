import { expect, test } from "bun:test";
import { createCodeHighlighter } from "../../../../src/app/frontend/components/HighlightedCode/background/tokenization";

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
test.each([
  ["javascript", "const value = `first\n\nsecond`;\n"],
  ["typescript", "/* 多行\n注释 */\nconst emoji: string = '😀';\n"],
  ["html", '<script>\nconst text = "<>&";\n</script>\n'],
  ["python", 'value = """first\nsecond"""\nprint(value)\n'],
  ["text", "\n<>&\"'\n\n末行"],
  ["javascript", "const value = 1;\r\n// comment\r\n"],
])("incremental %s markup matches fresh rendering at every prefix", async (language, code) => {
  const incremental = createCodeHighlighter(),
    reference = createCodeHighlighter();
  for (let end = 0; end <= code.length; end += 1) {
    const input = { code: code.slice(0, end), language, streamId: "comparison" },
      expected = await reference.highlight(input),
      actual = await incremental.highlight(input);
    expect(actual).toEqual(expected);
    reference.release(input.streamId);
  }
});
test("stable lines do not mutate previously returned results", async () => {
  const highlighter = createCodeHighlighter(),
    input = { code: "const first = 1;\n", language: "javascript", streamId: "immutable" },
    first = await highlighter.highlight(input),
    saved = [...first.lines],
    next = await highlighter.highlight({ ...input, code: `${input.code}const second = 2;\n` });
  expect(first.lines).toEqual(saved);
  expect(next.lines[0]).toBe(first.lines[0]);
  expect(next.lines).toHaveLength(3);
  expect(await highlighter.highlight(input)).toEqual(first);
});
test("changing language or releasing a stream discards cached markup", async () => {
  const highlighter = createCodeHighlighter(),
    input = { code: "const value = 42;", streamId: "reset" },
    highlighted = await highlighter.highlight({ ...input, language: "javascript" }),
    plain = await highlighter.highlight({ ...input, language: "text" });
  expect(plain.lines).toEqual([input.code]);
  expect(highlighted.lines).not.toEqual(plain.lines);
  highlighter.release(input.streamId);
  expect(await highlighter.highlight({ ...input, language: "javascript" })).toEqual(highlighted);
});
test("HTML source remains escaped when stable lines are reused", async () => {
  const highlighter = createCodeHighlighter(),
    input = { code: "<script>alert('x')</script>\n", language: "text", streamId: "escape" };
  await highlighter.highlight(input);
  const result = await highlighter.highlight({
    ...input,
    code: `${input.code}<img src=x onerror=alert(1)>`,
  });
  expect(result.lines.join("")).not.toContain("<script>");
  expect(result.lines.join("")).not.toContain("<img ");
  expect(result.lines.join("")).toContain("&lt;script&gt;");
});
