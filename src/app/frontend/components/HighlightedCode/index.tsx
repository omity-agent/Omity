import { type CustomContainerComponentProps, Virtualizer } from "virtua";
import { Fragment, memo, useRef } from "react";
import { HighlightedLine, codeLines } from "./lines";
import {
  block,
  codeElement,
  container,
  copyButton,
  sourceLine,
  widthSizer,
} from "../CodeBlock/styles";
import { CopyButton } from "../Chat/CopyButton";
import type { FilePathMatch } from "../../../../fileLinks/types";
import { codeWindow } from "../../../../../settings/rendering";
import { cx } from "styled-system/css";
import { normalizeCodeMatches } from "../FileLink/lineBreaks";
import { useFollowBottom } from "../Transcript/followBottom";
import { useHighlight } from "./useHighlight";

const noFileLinks: FilePathMatch[] = [];
function CodeSurface({ children, ref, style }: CustomContainerComponentProps) {
  return (
    <span className={codeElement()} ref={ref} style={style}>
      {children}
    </span>
  );
}
function HighlightedCodeView({
  autoFollow,
  className,
  code,
  fileLinkMatches = noFileLinks,
  language,
  layout = "contained",
}: {
  autoFollow?: boolean;
  className?: string;
  code: string;
  fileLinkMatches?: FilePathMatch[];
  language?: string;
  layout?: "contained" | "flow";
}) {
  const normalized = normalizeCodeMatches(code, fileLinkMatches),
    lines = codeLines(normalized.code, normalized.matches),
    widestLine = lines.reduce(
      (widest, line) => (line.text.length > widest.length ? line.text : widest),
      "",
    ),
    highlight = useHighlight(normalized.code, language),
    appendOnly = highlight !== undefined && normalized.code.startsWith(highlight.code),
    blockRef = useRef<HTMLPreElement>(null),
    onScroll = useFollowBottom({
      enabled: autoFollow,
      ref: blockRef,
    });
  return (
    <div className={container}>
      <CopyButton className={copyButton} value={code} />
      <pre className={cx(block({ layout }), className)} ref={blockRef} onScroll={onScroll}>
        <code className={codeElement({ layout })}>
          {layout === "flow" ? (
            lines.map((line, index) => (
              <Fragment key={line.start}>
                <HighlightedLine
                  appendOnly={appendOnly}
                  highlight={highlight}
                  line={line}
                  lineIndex={index}
                />
                {index < lines.length - 1 ? "\n" : null}
              </Fragment>
            ))
          ) : (
            <>
              <span aria-hidden className={widthSizer}>
                {widestLine}
              </span>
              <Virtualizer
                as={CodeSurface}
                bufferSize={codeWindow.bufferSize}
                data={lines}
                item="span"
                itemSize={codeWindow.estimatedLineHeight}
                scrollRef={blockRef}
              >
                {(line, index) => (
                  <span className={sourceLine} key={index}>
                    <HighlightedLine
                      appendOnly={appendOnly}
                      highlight={highlight}
                      line={line}
                      lineIndex={index}
                    />
                  </span>
                )}
              </Virtualizer>
            </>
          )}
        </code>
      </pre>
    </div>
  );
}
export const HighlightedCode = memo(HighlightedCodeView);
