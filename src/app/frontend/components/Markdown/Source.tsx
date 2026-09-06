import { type CSSProperties, Fragment, useLayoutEffect, useMemo, useRef, useState } from "react";
import { HighlightedLine, codeLines } from "../HighlightedCode/lines";
import { css, cx } from "styled-system/css";
import type { FilePathMatch } from "../../../../fileLinks/types";
import { highlightMarkdownSource } from "./syntax";
import { source } from "./styles";

const noFileLinks: FilePathMatch[] = [],
  container = css({ position: "relative", w: "full" }),
  measure = css({
    "&[aria-hidden]": { lineHeight: "1px" },
    left: 0,
    pointerEvents: "none",
    position: "absolute",
    top: 0,
    visibility: "hidden",
    w: "full",
  });
export function MarkdownSource({
  content,
  fileLinks = noFileLinks,
  targetHeight,
}: {
  content: string;
  fileLinks?: FilePathMatch[];
  targetHeight: number;
}) {
  const lines = useMemo(() => codeLines(content, fileLinks), [content, fileLinks]),
    highlight = useMemo(() => highlightMarkdownSource(content), [content]),
    measureReference = useRef<HTMLPreElement>(null),
    [visualLines, setVisualLines] = useState<number>(),
    lineHeight = targetHeight / (visualLines ?? Math.max(1, lines.length)),
    style = useMemo<CSSProperties>(
      () => ({ lineHeight: `${lineHeight.toString()}px` }),
      [lineHeight],
    );
  useLayoutEffect(() => {
    const element = measureReference.current;
    if (!element) {
      throw new Error("Markdown 源码测量元素未挂载");
    }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setVisualLines(sourceVisualLines(entry.contentRect.height));
      }
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  return (
    <div className={container}>
      <pre aria-hidden className={cx(source, measure)} ref={measureReference}>
        <code>{content}</code>
      </pre>
      <pre className={source} style={style}>
        <code>
          {lines.map((line, index) => (
            <Fragment key={line.start}>
              <HighlightedLine
                appendOnly={false}
                highlight={highlight}
                line={line}
                lineIndex={index}
              />
              {index < lines.length - 1 ? "\n" : null}
            </Fragment>
          ))}
        </code>
      </pre>
    </div>
  );
}
export function sourceVisualLines(measuredHeight: number) {
  return Math.max(1, Math.round(measuredHeight));
}
