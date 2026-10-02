import { afterAll, beforeAll, expect, test } from "bun:test";
import postcss, { type Root } from "postcss";
import { DisclosureProvider } from "../../../src/app/frontend/components/Transcript/disclosures";
import { MarkdownView } from "../../../src/app/frontend/components/MarkdownView";
import { Reasoning } from "../../../src/app/frontend/components/Details/Reasoning";
import { createCodeHighlighter } from "../../../src/app/frontend/components/HighlightedCode/background/tokenization";
import { i18nReady } from "../../../src/app/frontend/i18n";
import panda from "@pandacss/dev/postcss";
import { renderToStaticMarkup } from "react-dom/server";

const paletteClass = "layerStyle_reasoningText",
  languageDescriptor = Object.getOwnPropertyDescriptor(navigator, "languages"),
  registerDetail = () => () => undefined,
  reasoningPart = {
    content: [
      "## 思考标题",
      "",
      "普通文字、**粗体**、*斜体*、~~删除线~~、`value` 和 [链接](https://example.com)",
      "",
      "> 引用",
      "",
      "```typescript",
      "const value = 'colored';",
      "```",
    ].join("\n"),
    type: "reasoning" as const,
  },
  syntaxColors = [
    ["addition", "green"],
    ["comment", "indigo"],
    ["deletion", "red"],
    ["keyword", "purple"],
    ["meta", "blue"],
    ["number", "orange"],
    ["property", "blue"],
    ["string", "green"],
    ["title", "cyan"],
  ] as const;
let stylesheet: Root;
beforeAll(async () => {
  Object.defineProperty(navigator, "languages", { configurable: true, value: ["zh-CN"] });
  await i18nReady;
  const entry = "src/app/frontend/panda.css",
    result = await postcss([panda()]).process(await Bun.file(entry).text(), { from: entry });
  stylesheet = result.root;
}, 30_000);
afterAll(() => {
  if (languageDescriptor) {
    Object.defineProperty(navigator, "languages", languageDescriptor);
  } else {
    Reflect.deleteProperty(navigator, "languages");
  }
});
function declarations(selector: string) {
  const result: Record<string, string> = {};
  stylesheet.walkRules((rule) => {
    if (rule.selector === selector) {
      rule.walkDecls((declaration) => {
        result[declaration.prop] = declaration.value;
      });
    }
  });
  return result;
}
test.each([true, false])(
  "reasoning scopes its Markdown palette in expanded and collapsed views (open: %s)",
  async (open) => {
    const markup = renderToStaticMarkup(
        <DisclosureProvider registerDetail={registerDetail}>
          <Reasoning detailKey="reasoning-tone" latest={open} part={reasoningPart} />
        </DisclosureProvider>,
      ),
      scopes: string[] = [],
      rewriter = new HTMLRewriter().on(`.${paletteClass}`, {
        element(element) {
          scopes.push(element.tagName);
        },
      });
    await rewriter.transform(new Response(markup)).text();
    expect(scopes).toEqual([open ? "div" : "span"]);
    expect(markup).toContain("<strong>粗体</strong>");
    expect(markup).toContain("<em>斜体</em>");
    expect(markup).toContain("<del>删除线</del>");
  },
);
test("reasoning inherits its text shade and dims syntax hues without fading surfaces", () => {
  const scoped = declarations(`.${paletteClass}`);
  expect(scoped["--colors-text"]).toBe("currentColor");
  expect(scoped["--colors-muted-strong"]).toBe("currentColor");
  expect(scoped["--reasoning-syntax-strength"]).toBe("65%");
  for (const [role, hue] of syntaxColors) {
    expect(scoped[`--colors-syntax-${role}`]).toBe(
      `color-mix(in srgb, var(--colors-accent-${hue}) var(--reasoning-syntax-strength), var(--colors-canvas))`,
    );
  }
  expect(scoped).not.toHaveProperty("opacity");
  expect(scoped).not.toHaveProperty("filter");
  expect(scoped).not.toHaveProperty("--colors-surface-inset");
  expect(scoped).not.toHaveProperty("--colors-line");
});
test("ordinary Markdown keeps the original palette outside reasoning", () => {
  const markup = renderToStaticMarkup(<MarkdownView content={reasoningPart.content} />);
  expect(markup).not.toContain(paletteClass);
  expect(stylesheet.toString()).toContain("--colors-text: var(--colors-ink-50)");
  expect(stylesheet.toString()).toContain("--colors-syntax-meta: var(--colors-accent-blue)");
});
test("streamed code highlights resolve the same scoped syntax palette", async () => {
  const highlighter = createCodeHighlighter(),
    result = await highlighter.highlight({
      code: "const value = 'colored'; // comment",
      language: "typescript",
      streamId: "reasoning-tone",
    }),
    markup = result.lines.join("\n");
  expect(markup).toContain("var(--colors-syntax-keyword)");
  expect(markup).toContain("var(--colors-syntax-string)");
  expect(markup).toContain("var(--colors-syntax-comment)");
  expect(markup).not.toMatch(/color:\s*#[\da-f]+/iu);
  highlighter.release("reasoning-tone");
});
