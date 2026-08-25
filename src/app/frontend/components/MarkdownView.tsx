import {
  type ComponentProps,
  type ReactNode,
  createContext,
  createElement,
  useContext,
  useMemo,
} from "react";
import { FileLinkMenu, FileLinkMenuOpenProvider } from "./FileLink/Menu";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import {
  fileLinkRemark,
  localizeMatches,
  matchInsideNode,
  pathFromFileLinkHref,
} from "./FileLink/markdown";
import { inlineCode, region, rendered, tableScroll } from "./Markdown/styles";
import { normalizeCodeMatches, normalizeLineBreaks } from "./FileLink/lineBreaks";
import { Code } from "./ParkUI";
import type { FilePathMatch } from "../../../fileLinks/types";
import { HighlightedCode } from "./HighlightedCode";
import { MarkdownSource } from "./Markdown/Source";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { useSourceHover } from "./Markdown/hover";

interface MarkdownRenderContext {
  fileLinks: FilePathMatch[];
  source: string;
}
const MarkdownContext = createContext<MarkdownRenderContext | undefined>(undefined),
  noFileLinks: FilePathMatch[] = [];
function codeText(value: ReactNode): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(codeText).join("");
  }
  return "";
}
export function MarkdownView({
  content,
  fileLinks = noFileLinks,
  preserveLineBreaks = false,
}: {
  content: string;
  fileLinks?: FilePathMatch[];
  preserveLineBreaks?: boolean;
}) {
  const normalized = useMemo(() => {
      const result = normalizeCodeMatches(content, fileLinks);
      return {
        content: result.code,
        context: { fileLinks: result.matches, source: result.code },
        fileLinks: result.matches,
        remarkPlugins: [
          remarkGfm,
          fileLinkRemark(result.matches),
          ...(preserveLineBreaks ? [remarkBreaks] : []),
        ],
      };
    }, [content, fileLinks, preserveLineBreaks]),
    {
      handlePointerEnter,
      handlePointerLeave,
      handlePointerMove,
      onMenuOpenChange,
      regionReference,
      renderedHeight,
      style,
    } = useSourceHover();
  return (
    <MarkdownContext.Provider value={normalized.context}>
      <div
        className={region}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onPointerMove={handlePointerMove}
        ref={regionReference}
        style={style}
      >
        {renderedHeight !== undefined ? (
          <FileLinkMenuOpenProvider value={onMenuOpenChange}>
            <MarkdownSource
              content={normalized.content}
              fileLinks={normalized.fileLinks}
              targetHeight={renderedHeight}
            />
          </FileLinkMenuOpenProvider>
        ) : (
          <div className={rendered}>
            <ReactMarkdown components={components} remarkPlugins={normalized.remarkPlugins}>
              {normalized.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </MarkdownContext.Provider>
  );
}
export function MarkdownInline({ content }: { content: string }) {
  const normalized = useMemo(() => {
    const source = normalizeLineBreaks(content);
    return { context: { fileLinks: noFileLinks, source }, source };
  }, [content]);
  return (
    <MarkdownContext.Provider value={normalized.context}>
      <ReactMarkdown
        allowedElements={inlineElements}
        components={inlineComponents}
        unwrapDisallowed
      >
        {normalized.source}
      </ReactMarkdown>
    </MarkdownContext.Provider>
  );
}
function MarkdownAnchor({ children, href, node, ...props }: ComponentProps<"a"> & ExtraProps) {
  const { fileLinks } = useMarkdownRenderContext(),
    linkedPath = pathFromFileLinkHref(href),
    match =
      matchInsideNode(node, fileLinks) ??
      fileLinks.find((candidate) => candidate.path === linkedPath);
  if (match !== undefined) {
    return (
      <FileLinkMenu kind={match.kind} path={match.path}>
        {children}
      </FileLinkMenu>
    );
  }
  return createElement(
    "a",
    { ...props, href, rel: "noopener noreferrer", target: "_blank" },
    children,
  );
}
function MarkdownCode({ children, className, node }: ComponentProps<"code"> & ExtraProps) {
  const { fileLinks, source } = useMarkdownRenderContext(),
    raw = codeText(children),
    code = raw.replace(/\n$/, ""),
    matches = localizeMatches(code, source, node, fileLinks),
    language = className?.match(/(?:^|\s)language-(?<language>[^\s]+)/)?.groups?.["language"];
  if (className || raw.includes("\n")) {
    return <HighlightedCode code={code} fileLinkMatches={matches} language={language} />;
  }
  const codeNode = (
      <Code className={inlineCode} size="md" variant="ghost">
        {children}
      </Code>
    ),
    [match] = matches;
  return match ? (
    <FileLinkMenu kind={match.kind} path={match.path}>
      {codeNode}
    </FileLinkMenu>
  ) : (
    codeNode
  );
}
function MarkdownPre({ children }: ComponentProps<"pre"> & ExtraProps) {
  return <>{children}</>;
}
function MarkdownTable({ node: _node, ...props }: ComponentProps<"table"> & ExtraProps) {
  return <div className={tableScroll}>{createElement("table", props)}</div>;
}
const components = {
    a: MarkdownAnchor,
    code: MarkdownCode,
    pre: MarkdownPre,
    table: MarkdownTable,
  } satisfies Components,
  inlineComponents = { code: MarkdownCode } satisfies Components,
  inlineElements = ["code", "del", "em", "strong"];
function useMarkdownRenderContext() {
  const context = useContext(MarkdownContext);
  if (!context) {
    throw new Error("Markdown 渲染组件缺少上下文");
  }
  return context;
}
