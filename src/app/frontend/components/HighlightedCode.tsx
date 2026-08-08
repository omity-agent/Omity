import { block, codeElement, container, copyButton } from "./CodeBlock/styles";
import { normalizeCodeMatches, normalizeLineBreaks } from "./FileLink/lineBreaks";
import { useMemo, useRef } from "react";
import { CopyButton } from "./Chat/CopyButton";
import DOMPurify from "dompurify";
import type { FilePathMatch } from "../../fileLinks/types";
import { HighlightedText } from "./FileLink/HighlightedText";
import type { ProbeMode } from "./FileLink/probeUnits";
import { cx } from "styled-system/css";
import hljs from "highlight.js/lib/common";
import { useFileLinkMatches } from "./FileLink/useMatches";
import { useFollowBottom } from "./TranscriptScroll";

export function HighlightedCode({
  autoFollow,
  className,
  code,
  fileLinkComplete = true,
  fileLinkIdentity,
  fileLinkMatches,
  fileLinkMode = "lines",
  language,
}: {
  autoFollow?: boolean;
  className?: string;
  code: string;
  fileLinkComplete?: boolean;
  fileLinkIdentity?: string;
  fileLinkMatches?: FilePathMatch[];
  fileLinkMode?: ProbeMode;
  language?: string;
}) {
  if (fileLinkMatches !== undefined) {
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
  if (fileLinkIdentity === undefined) {
    throw new Error("代码块缺少文件链接探测标识");
  }
  const normalizedCode = normalizeLineBreaks(code);
  return (
    <ProbedHighlightedCode
      autoFollow={autoFollow}
      className={className}
      code={normalizedCode}
      complete={fileLinkComplete}
      copyValue={code}
      identity={fileLinkIdentity}
      language={language}
      mode={fileLinkMode}
    />
  );
}
function ProbedHighlightedCode({
  autoFollow,
  className,
  code,
  complete,
  copyValue,
  identity,
  language,
  mode,
}: {
  autoFollow?: boolean;
  className?: string;
  code: string;
  complete: boolean;
  copyValue: string;
  identity: string;
  language?: string;
  mode: ProbeMode;
}) {
  const { matches } = useFileLinkMatches(code, mode, complete, identity);
  return (
    <HighlightedCodeView
      autoFollow={autoFollow}
      className={className}
      code={code}
      copyValue={copyValue}
      fileLinkMatches={matches}
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
