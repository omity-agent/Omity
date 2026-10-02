import { MarkdownInline, MarkdownView } from "../../../src/app/frontend/components/MarkdownView";
import { beforeAll, describe, expect, test } from "bun:test";
import { FileLinkProvider } from "../../../src/app/frontend/components/FileLink/context";
import { escape as escapeHtml } from "es-toolkit";
import { i18nReady } from "../../../src/app/frontend/i18n";
import { renderToStaticMarkup } from "react-dom/server";

const renderers = [
    ["正文", MarkdownView],
    ["行内摘要", MarkdownInline],
  ] as const,
  modifiers = [
    ["**", "strong"],
    ["*", "em"],
    ["~~", "del"],
  ] as const,
  punctuated = [
    "加粗（含括号）",
    "（开头含括号）",
    "text(parentheses)",
    "“引号”",
    '"quotes"',
    "提示：",
    "句号。",
    "加号+",
    "a & b",
  ],
  linkCases = ["“src/demo(1).ts”", "`src/demo(1).ts`"].map((text) => {
    const path = "src/demo(1).ts",
      content = `前言\r\n前文**${text}**后文`,
      start = content.indexOf(path),
      matches = [{ kind: "file" as const, path, position: { end: start + path.length, start } }];
    return [text, path, content, matches] as const;
  });
beforeAll(async () => {
  await i18nReady;
});
describe.each(renderers)("%s Markdown rendering", (_surface, Renderer) => {
  test.each(modifiers)("%s recognizes punctuation at CJK modifier boundaries", (delimiter, tag) => {
    for (const text of punctuated) {
      const markup = renderToStaticMarkup(
        <Renderer content={`前文${delimiter}${text}${delimiter}后文`} />,
      );
      expect(markup).toContain(`<${tag}>${escapeHtml(text)}</${tag}>`);
    }
  });
  test("recognizes nested emphasis around inline code", () => {
    const markup = renderToStaticMarkup(<Renderer content="前文***`source.ts`***后文" />);
    expect(markup).toMatch(/<em><strong><code\b[^>]*>source\.ts<\/code><\/strong><\/em>/u);
  });
  test("keeps escaped delimiters and inline code literal", () => {
    const content = "前文\\*\\*（原样）\\*\\*后文，以及`**（代码）**`",
      markup = renderToStaticMarkup(<Renderer content={content} />);
    expect(markup).toContain("前文**（原样）**后文");
    expect(markup).toMatch(/<code\b[^>]*>\*\*（代码）\*\*<\/code>/u);
    expect(markup).not.toContain("<strong>");
  });
  test("keeps whitespace and non-CJK boundary rules unchanged", () => {
    for (const [content, expected] of [
      ["word**(literal)**word", "word**(literal)**word"],
      ["前文** 空白 **后文", "前文** 空白 **后文"],
      ["**ordinary**", "<strong>ordinary</strong>"],
    ] as const) {
      const markup = renderToStaticMarkup(<Renderer content={content} />);
      expect(markup).toContain(expected);
    }
  });
  test("renders strikethrough with nested emphasis and code", () => {
    const markup = renderToStaticMarkup(<Renderer content="前文~~**`source.ts`**~~后文" />);
    expect(markup).toMatch(/<del><strong><code\b[^>]*>source\.ts<\/code><\/strong><\/del>/u);
  });
});
test.each(linkCases)(
  "keeps file-link offsets inside emphasized %s after newline normalization",
  async (_text, path, content, matches) => {
    const markup = renderToStaticMarkup(
        <FileLinkProvider sessionId="modifier-boundaries">
          <MarkdownView content={content} fileLinks={matches} />
        </FileLinkProvider>,
      ),
      linkedPaths: string[] = [],
      rewriter = new HTMLRewriter().on("strong button[title]", {
        element(element) {
          linkedPaths.push(element.getAttribute("title")!);
        },
      });
    await rewriter.transform(new Response(markup)).text();
    expect(linkedPaths).toEqual([path]);
  },
);
test("keeps fenced code literal while rendering GFM tables and preserved line breaks", () => {
  const content = [
      "```text",
      "前文**（代码）**后文",
      "```",
      "",
      "| 项目 | 内容 |",
      "| --- | --- |",
      "| 标点 | 前文**（表格）**后文 |",
      "",
      "前文**（换行）**后文",
      "第二行",
    ].join("\n"),
    markup = renderToStaticMarkup(<MarkdownView content={content} preserveLineBreaks />);
  expect(markup).toContain("前文**（代码）**后文");
  expect(markup).toContain("<table>");
  expect(markup).toContain("<strong>（表格）</strong>");
  expect(markup).toContain("<strong>（换行）</strong>后文<br/>");
});
