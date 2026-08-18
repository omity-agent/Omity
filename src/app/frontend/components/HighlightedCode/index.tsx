import { type CSSProperties, memo, useMemo, useRef } from "react";
import { HighlightedLine, codeLines } from "./lines";
import { type VirtualItem, useVirtualizer } from "@tanstack/react-virtual";
import { block, codeElement, container, copyButton, virtualLine } from "../CodeBlock/styles";
import { CopyButton } from "../Chat/CopyButton";
import type { FilePathMatch } from "../../../../fileLinks/types";
import { cx } from "styled-system/css";
import { normalizeCodeMatches } from "../FileLink/lineBreaks";
import { useFollowBottom } from "../TranscriptScroll";
import { useHighlight } from "./useHighlight";

const noFileLinks: FilePathMatch[] = [],
  estimatedLineHeight = 24;
function HighlightedCodeView({
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
  const normalized = useMemo(
      () => normalizeCodeMatches(code, fileLinkMatches),
      [code, fileLinkMatches],
    ),
    lines = useMemo(
      () => codeLines(normalized.code, normalized.matches),
      [normalized.code, normalized.matches],
    ),
    highlight = useHighlight(normalized.code, language),
    blockRef = useRef<HTMLPreElement>(null),
    onScroll = useFollowBottom({
      enabled: autoFollow,
      ref: blockRef,
      version: normalized.code,
    }),
    virtualizer = useVirtualizer({
      count: lines.length,
      estimateSize: () => estimatedLineHeight,
      getScrollElement: () => blockRef.current,
      overscan: 8,
      useAnimationFrameWithResizeObserver: true,
    }),
    virtualLines = virtualizer.getVirtualItems(),
    totalSize = virtualizer.getTotalSize(),
    codeStyle = useMemo<CSSProperties>(
      () => ({
        height: `${totalSize.toString()}px`,
        position: "relative",
      }),
      [totalSize],
    );
  return (
    <div className={container}>
      <CopyButton className={copyButton} value={code} />
      <pre className={cx(block, className)} ref={blockRef} onScroll={onScroll}>
        <code className={codeElement} style={codeStyle}>
          {virtualLines.map((item) => (
            <CodeRow
              highlight={highlight}
              item={item}
              key={item.key}
              line={lines[item.index]}
              measure={virtualizer.measureElement}
            />
          ))}
        </code>
      </pre>
    </div>
  );
}
export const HighlightedCode = memo(HighlightedCodeView);
function CodeRow({
  highlight,
  item,
  line,
  measure,
}: {
  highlight?: ReturnType<typeof useHighlight>;
  item: VirtualItem;
  line?: ReturnType<typeof codeLines>[number];
  measure: (element: Element | null) => void;
}) {
  const style = useMemo<CSSProperties>(
    () => ({ transform: `translateY(${item.start.toString()}px)` }),
    [item.start],
  );
  return line ? (
    <span className={virtualLine} data-index={item.index} ref={measure} style={style}>
      <HighlightedLine highlight={highlight} line={line} lineIndex={item.index} />
    </span>
  ) : null;
}
