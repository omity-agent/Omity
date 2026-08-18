import {
  type ComponentProps,
  type ReactNode,
  createContext,
  createElement,
  useContext,
  useMemo,
} from "react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import {
  fileLinkRemark,
  localizeMatches,
  matchInsideNode,
  pathFromFileLinkHref,
} from "./FileLink/markdown";
import { inlineCode, markdown, tableScroll } from "./Markdown/styles";
import { Code } from "./ParkUI";
import { FileLinkMenu } from "./FileLink/Menu";
import type { FilePathMatch } from "../../../fileLinks/types";
import { HighlightedCode } from "./HighlightedCode";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

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
  const context = useMemo(() => ({ fileLinks, source: content }), [content, fileLinks]),
    remarkPlugins = useMemo(
      () => [remarkGfm, fileLinkRemark(fileLinks), ...(preserveLineBreaks ? [remarkBreaks] : [])],
      [fileLinks, preserveLineBreaks],
    );
  return (
    <MarkdownContext.Provider value={context}>
      <div className={markdown}>
        <ReactMarkdown components={components} remarkPlugins={remarkPlugins}>
          {content}
        </ReactMarkdown>
      </div>
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
  const rendered = (
      <Code className={inlineCode} size="md" variant="ghost">
        {children}
      </Code>
    ),
    [match] = matches;
  return match ? (
    <FileLinkMenu kind={match.kind} path={match.path}>
      {rendered}
    </FileLinkMenu>
  ) : (
    rendered
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
} satisfies Components;
function useMarkdownRenderContext() {
  const context = useContext(MarkdownContext);
  if (!context) {
    throw new Error("Markdown 渲染组件缺少上下文");
  }
  return context;
}
