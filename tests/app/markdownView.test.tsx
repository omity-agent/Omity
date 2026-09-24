import { describe, expect, test } from "bun:test";
import { FileLinkProvider } from "../../src/app/frontend/components/FileLink/context";
import { I18nextProvider } from "react-i18next";
import { MarkdownView } from "../../src/app/frontend/components/MarkdownView";
import { createInstance } from "i18next";
import { createTestDirectory } from "../support/artifacts";
import { join } from "node:path";
import { probeFileLinks } from "../../src/fileLinks/probe";
import { renderToStaticMarkup } from "react-dom/server";

const i18n = createInstance();
await i18n.init({ lng: "zh-CN", resources: {} });
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
  test("链接不透传解析节点并在新窗口安全打开", () => {
    const html = renderToStaticMarkup(<MarkdownView content="[示例](https://example.com/path)" />);
    expect(html).toContain(
      '<a href="https://example.com/path" rel="noopener noreferrer" target="_blank">示例</a>',
    );
    expect(html).not.toContain('node="');
  });
  test.each([
    "查看 ./linked.ts:12",
    "查看 `./linked.ts:12`",
    "查看 [./linked.ts:12](./linked.ts:12)",
    "查看 [`./linked.ts:12`](./linked.ts:12)",
    "查看 [**`./linked.ts:12:8`**](./linked.ts:12:8)",
    "查看 [`./linked.ts:12`][source]\n\n[source]: ./linked.ts:12",
  ])("带行号的文件引用只有一个菜单触发器：%s", async (content) => {
    const workspace = createTestDirectory("markdown-menu"),
      path = join(workspace, "linked.ts");
    await Bun.write(path, "export {};");
    const matches = await probeFileLinks(content, workspace),
      html = renderToStaticMarkup(
        <I18nextProvider i18n={i18n}>
          <FileLinkProvider sessionId="test-session">
            <MarkdownView content={content} fileLinks={matches} />
          </FileLinkProvider>
        </I18nextProvider>,
      );
    expect(matches.length).toBeGreaterThan(0);
    expect(html.match(/data-part="trigger"/g)).toHaveLength(1);
    expect(html.match(/role="menu"/g)).toHaveLength(1);
    expect(html).toContain("./linked.ts");
    expect(html).toContain(":12");
    if (content.includes("`")) {
      expect(html).toContain("<code");
    }
  });
});
