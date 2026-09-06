import { describe, expect, test } from "bun:test";
import { MarkdownView } from "../../src/app/frontend/components/MarkdownView";
import { highlightMarkdownSource } from "../../src/app/frontend/components/Markdown/syntax";
import { renderToStaticMarkup } from "react-dom/server";
import { sourceVisualLines } from "../../src/app/frontend/components/Markdown/Source";

describe("MarkdownView", () => {
  test("按用户输入语义保留段落内的单个换行", () => {
    const html = renderToStaticMarkup(
      <MarkdownView content={"第一行\n第二行"} preserveLineBreaks />,
    );
    expect(html).toContain("第一行<br/>");
    expect(html).toContain("第二行");
  });
  test("默认仍遵循 CommonMark 软换行语义", () => {
    const html = renderToStaticMarkup(<MarkdownView content={"第一行\n第二行"} />);
    expect(html).not.toContain("<br");
  });
  test("在 Markdown 入口归一化每种行分隔符", () => {
    const html = renderToStaticMarkup(
      <MarkdownView content={"第一行\r\n第二行\r第三行\u2028第四行"} preserveLineBreaks />,
    );
    expect(html).not.toContain("\r");
    expect(html.match(/<br\/>/g)).toHaveLength(3);
  });
  test("时间线源码使用 Markdown 编辑器的语法高亮类", () => {
    const highlighted = highlightMarkdownSource("# 标题\n[链接](https://example.com)");
    expect(highlighted.lines[0]).toMatch(/<span class="[^"]+">#<\/span>/);
    expect(highlighted.lines[1]).toMatch(/<span class="[^"]+">https:\/\/example\.com<\/span>/);
  });
  test("源码测量层的一像素行高转换为实际折行数", () => {
    expect(sourceVisualLines(5)).toBe(5);
    expect(sourceVisualLines(4.99999)).toBe(5);
  });
  test("空源码仍具有有限的行高", () => {
    expect(sourceVisualLines(0)).toBe(1);
  });
  test("链接不透传解析节点并在新窗口安全打开", () => {
    const html = renderToStaticMarkup(<MarkdownView content="[示例](https://example.com/path)" />);
    expect(html).toContain(
      '<a href="https://example.com/path" rel="noopener noreferrer" target="_blank">示例</a>',
    );
    expect(html).not.toContain('node="');
  });
  test("表格具有独立的横向滚动容器", () => {
    const html = renderToStaticMarkup(<MarkdownView content={"| 标题 |\n| --- |\n| 内容 |"} />);
    expect(html).toMatch(/<div class="[^"]+"><table>/);
  });
  test("保留远程 Markdown 图片链接", () => {
    const html = renderToStaticMarkup(
      <MarkdownView content="![预览](https://images.example.com/preview.png)" />,
    );
    expect(html).toContain('<img src="https://images.example.com/preview.png" alt="预览"/>');
  });
});
