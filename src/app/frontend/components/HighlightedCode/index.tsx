import { HighlightedLine, codeLines } from "./lines";
import { type VirtualItem, useVirtualizer } from "@tanstack/react-virtual";
import {
  block,
  codeElement,
  container,
  copyButton,
  virtualLine,
  widthSizer,
} from "../CodeBlock/styles";
import {
  measureItemHeight,
  scrollWithMeasuredExtent,
} from "../../services/scheduling/scrollGeometry";
import { memo, useMemo, useRef } from "react";
import { CopyButton } from "../Chat/CopyButton";
import type { FilePathMatch } from "../../../../fileLinks/types";
import { codeWindow } from "../../../../../settings/rendering";
import { cx } from "styled-system/css";
import { normalizeCodeMatches } from "../FileLink/lineBreaks";
import { useFollowBottom } from "../Transcript/followBottom";
import { useHighlight } from "./useHighlight";

const noFileLinks: FilePathMatch[] = [];
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
  "use no memo";
  const normalized = useMemo(
      () => normalizeCodeMatches(code, fileLinkMatches),
      [code, fileLinkMatches],
    ),
    lines = useMemo(
      () => codeLines(normalized.code, normalized.matches),
      [normalized.code, normalized.matches],
    ),
    widestLine = useMemo(
      () =>
        lines.reduce((widest, line) => (line.text.length > widest.length ? line.text : widest), ""),
      [lines],
    ),
    highlight = useHighlight(normalized.code, language),
    appendOnly = highlight !== undefined && normalized.code.startsWith(highlight.code),
    blockRef = useRef<HTMLPreElement>(null),
    onScroll = useFollowBottom({
      enabled: autoFollow,
      ref: blockRef,
    }),
    // oxlint-disable-next-line react/incompatible-library
    virtualizer = useVirtualizer({
      count: lines.length,
      directDomUpdates: true,
      estimateSize: () => codeWindow.estimatedLineHeight,
      getScrollElement: () => blockRef.current,
      measureElement: measureItemHeight,
      overscan: codeWindow.overscan,
      scrollToFn: scrollWithMeasuredExtent,
      useFlushSync: false,
    }),
    virtualLines = virtualizer.getVirtualItems();
  return (
    <div className={container}>
      <CopyButton className={copyButton} value={code} />
      <pre className={cx(block, className)} ref={blockRef} onScroll={onScroll}>
        <code className={codeElement} ref={virtualizer.containerRef}>
          <span aria-hidden className={widthSizer}>
            {widestLine}
          </span>
          {virtualLines.map((item) => (
            <CodeRow
              appendOnly={appendOnly}
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
  appendOnly,
  highlight,
  item,
  line,
  measure,
}: {
  appendOnly: boolean;
  highlight?: ReturnType<typeof useHighlight>;
  item: VirtualItem;
  line?: ReturnType<typeof codeLines>[number];
  measure: (element: Element | null) => void;
}) {
  return line ? (
    <span className={virtualLine} data-index={item.index} ref={measure}>
      <HighlightedLine
        appendOnly={appendOnly}
        highlight={highlight}
        line={line}
        lineIndex={item.index}
      />
    </span>
  ) : null;
}
