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
import type { FilePathMatch } from "../../../fileLinks/types";
import { HighlightedCode } from "./HighlightedCode";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

const noFileLinks: FilePathMatch[] = [];
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
  const components = useMemo(() => markdownComponents(content, fileLinks), [content, fileLinks]);
  const remarkPlugins = useMemo(
    () => [remarkGfm, fileLinkRemark(fileLinks), ...(preserveLineBreaks ? [remarkBreaks] : [])],
    [fileLinks, preserveLineBreaks],
  );
  return (
    <div className={markdown}>
      <ReactMarkdown components={components} remarkPlugins={remarkPlugins}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
function markdownComponents(source: string, fileLinks: FilePathMatch[]): Components {
  return {
    a: ({ children, href, node, ...props }) => {
      const linkedPath = pathFromFileLinkHref(href);
      const match =
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
    },
    code: ({ children, className, node }) => {
      const raw = codeText(children);
      const code = raw.replace(/\n$/, "");
      const matches = localizeMatches(code, source, node, fileLinks);
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
      const [match] = matches;
      return match ? (
        <FileLinkMenu kind={match.kind} path={match.path}>
          {rendered}
        </FileLinkMenu>
      ) : (
        rendered
      );
    },
    pre: ({ children }) => <>{children}</>,
    table: ({ node: _node, ...props }) => (
      <div className={tableScroll}>{createElement("table", props)}</div>
    ),
  };
}
