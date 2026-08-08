import { block, codeElement, container, copyButton } from "./CodeBlock/styles";
import { useMemo, useRef } from "react";
import { CopyButton } from "./Chat/CopyButton";
import DOMPurify from "dompurify";
import type { FilePathMatch } from "../../../fileLinks/types";
import { HighlightedText } from "./FileLink/HighlightedText";
import { cx } from "styled-system/css";
import hljs from "highlight.js/lib/common";
import { normalizeCodeMatches } from "./FileLink/lineBreaks";
import { useFollowBottom } from "./TranscriptScroll";

const noFileLinks: FilePathMatch[] = [];
export function HighlightedCode({
  autoFollow,
  className,
  code,
  fileLinkMatches = noFileLinks,
  language,
}: {
  autoFollow?: boolean;
  className?: string;
  code: string;
  fileLinkMatches?: FilePathMatch[];
  language?: string;
}) {
  const normalized = normalizeCodeMatches(code, fileLinkMatches);
  return (
    <HighlightedCodeView
      autoFollow={autoFollow}
      className={className}
      code={normalized.code}
      copyValue={code}
      fileLinkMatches={normalized.matches}
      language={language}
    />
  );
}
function HighlightedCodeView({
  autoFollow,
  className,
  code,
  copyValue,
  fileLinkMatches,
  language,
}: {
  autoFollow?: boolean;
  className?: string;
  code: string;
  copyValue: string;
  fileLinkMatches: FilePathMatch[];
  language?: string;
}) {
  const blockRef = useRef<HTMLPreElement>(null);
  const onScroll = useFollowBottom({
    enabled: autoFollow,
    ref: blockRef,
    version: code,
  });
  const highlightedHtml = useMemo(
    () => DOMPurify.sanitize(highlight(code, language)),
    [code, language],
  );
  const highlightedMarkup = useMemo(() => ({ __html: highlightedHtml }), [highlightedHtml]);
  return (
    <div className={container}>
      <CopyButton className={copyButton} value={copyValue} />
      <pre className={cx(block, className)} ref={blockRef} onScroll={onScroll}>
        <code className={codeElement}>
          {fileLinkMatches.length > 0 ? (
            <HighlightedText html={highlightedHtml} matches={fileLinkMatches} />
          ) : (
            <span dangerouslySetInnerHTML={highlightedMarkup} />
          )}
        </code>
      </pre>
    </div>
  );
}
function highlight(code: string, language?: string) {
  const normalized = normalizeLanguage(language);
  if (normalized && hljs.getLanguage(normalized)) {
    return hljs.highlight(code, {
      ignoreIllegals: true,
      language: normalized,
    }).value;
  }
  return hljs.highlightAuto(code).value;
}
function normalizeLanguage(language?: string) {
  return language
    ?.replace(/^language-/, "")
    .trim()
    .toLowerCase();
}
