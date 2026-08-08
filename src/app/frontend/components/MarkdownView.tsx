import ReactMarkdown, { type Components } from "react-markdown";
import { type ReactNode, createElement, useMemo } from "react";
import {
  fileLinkRemark,
  localizeMatches,
  matchInsideNode,
  pathFromFileLinkHref,
} from "./FileLink/markdown";
import { inlineCode, markdown, tableScroll } from "./Markdown/styles";
import { Code } from "./ParkUI";
import { FileLinkMenu } from "./FileLink/Menu";
import { HighlightedCode } from "./HighlightedCode";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { useFileLinkMatches } from "./FileLink/useMatches";

const emptyFileLinks: ReturnType<typeof useFileLinkMatches> = {
  matches: [],
  positionSettled: settledPosition,
};
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
  complete = true,
  content,
  fileLinkIdentity,
  preserveLineBreaks = false,
}: {
  complete?: boolean;
  content: string;
  fileLinkIdentity?: string;
  preserveLineBreaks?: boolean;
}) {
  if (fileLinkIdentity === undefined) {
    return (
      <MarkdownContent
        content={content}
        fileLinks={emptyFileLinks}
        preserveLineBreaks={preserveLineBreaks}
      />
    );
  }
  return (
    <ProbedMarkdown
      complete={complete}
      content={content}
      fileLinkIdentity={fileLinkIdentity}
      preserveLineBreaks={preserveLineBreaks}
    />
  );
}
function ProbedMarkdown({
  complete,
  content,
  fileLinkIdentity,
  preserveLineBreaks,
}: {
  complete: boolean;
  content: string;
  fileLinkIdentity: string;
  preserveLineBreaks: boolean;
}) {
  const fileLinks = useFileLinkMatches(content, "lines", complete, fileLinkIdentity);
  return (
    <MarkdownContent
      content={content}
      fileLinks={fileLinks}
      preserveLineBreaks={preserveLineBreaks}
    />
  );
}
function MarkdownContent({
  content,
  fileLinks,
  preserveLineBreaks,
}: {
  content: string;
  fileLinks: ReturnType<typeof useFileLinkMatches>;
  preserveLineBreaks: boolean;
}) {
  const components = useMemo(() => markdownComponents(content, fileLinks), [content, fileLinks]);
  const remarkPlugins = useMemo(
    () => [
      remarkGfm,
      fileLinkRemark(fileLinks.matches),
      ...(preserveLineBreaks ? [remarkBreaks] : []),
    ],
    [fileLinks.matches, preserveLineBreaks],
  );
  return (
    <div className={markdown}>
      <ReactMarkdown components={components} remarkPlugins={remarkPlugins}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
function markdownComponents(
  source: string,
  fileLinks: ReturnType<typeof useFileLinkMatches>,
): Components {
  return {
    a: ({ children, href, node, ...props }) => {
      const path = pathFromFileLinkHref(href) ?? matchInsideNode(node, fileLinks.matches)?.path;
      if (path) {
        return <FileLinkMenu path={path}>{children}</FileLinkMenu>;
      }
      if (href && possibleFileHref(href) && !nodeSettled(node, fileLinks.positionSettled)) {
        return <span>{children}</span>;
      }
      return createElement(
        "a",
        { ...props, href, rel: "noopener noreferrer", target: "_blank" },
        children,
      );
    },
    code: ({ children, className, node }) => {
      const raw = codeText(children);
      const code = raw.replace(/\n$/, "");
      const matches = localizeMatches(code, source, node, fileLinks.matches);
      const language = className?.match(/(?:^|\s)language-(?<language>[^\s]+)/)?.groups?.[
        "language"
      ];
      if (className || raw.includes("\n")) {
        return <HighlightedCode code={code} fileLinkMatches={matches} language={language} />;
      }
      const rendered = (
        <Code className={inlineCode} size="md" variant="ghost">
          {children}
        </Code>
      );
      return matches[0] ? <FileLinkMenu path={matches[0].path}>{rendered}</FileLinkMenu> : rendered;
    },
    pre: ({ children }) => <>{children}</>,
    table: ({ node: _node, ...props }) => (
      <div className={tableScroll}>{createElement("table", props)}</div>
    ),
  };
}
function settledPosition() {
  return true;
}
function nodeSettled(
  node: { position?: { end: { offset?: number }; start: { offset?: number } } } | undefined,
  settled: (start: number, end: number) => boolean,
) {
  const start = node?.position?.start.offset;
  const end = node?.position?.end.offset;
  return start !== undefined && end !== undefined && settled(start, end);
}
function possibleFileHref(href: string) {
  return !href.startsWith("#") && !href.startsWith("//") && !/^[a-z][a-z\d+.-]*:/iu.test(href);
}
