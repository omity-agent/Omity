import {
  type CSSProperties,
  Fragment,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { HighlightedLine, codeLines } from "../HighlightedCode/lines";
import type { FilePathMatch } from "../../../../fileLinks/types";
import { highlightMarkdownSource } from "./syntax";
import { source } from "./styles";

const noFileLinks: FilePathMatch[] = [];
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
    sourceReference = useRef<HTMLPreElement>(null),
    [lineHeight, setLineHeight] = useState<number>(),
    style = useMemo<CSSProperties>(
      () => (lineHeight === undefined ? {} : { lineHeight: `${lineHeight.toString()}px` }),
      [lineHeight],
    ),
    fitHeight = useCallback(() => {
      const element = sourceReference.current;
      if (!element) {
        return;
      }
      const previousLineHeight = element.style.lineHeight;
      element.style.lineHeight = "";
      const naturalLineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
      if (!Number.isFinite(naturalLineHeight) || naturalLineHeight <= 0) {
        throw new Error("Markdown 源码视图无法计算自然行高");
      }
      const fitted = fitSourceLineHeight(targetHeight, element.scrollHeight, naturalLineHeight);
      element.style.lineHeight = previousLineHeight;
      setLineHeight((current) =>
        current !== undefined && Math.abs(current - fitted) < 0.01 ? current : fitted,
      );
    }, [setLineHeight, targetHeight]);
  useLayoutEffect(() => {
    fitHeight();
    const observer = new ResizeObserver(fitHeight),
      container = sourceReference.current?.parentElement;
    if (container) {
      observer.observe(container);
    }
    return () => {
      observer.disconnect();
    };
  }, [fitHeight]);
  return (
    <pre className={source} ref={sourceReference} style={style}>
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
  );
}
export function fitSourceLineHeight(
  targetHeight: number,
  naturalHeight: number,
  naturalLineHeight: number,
) {
  const visualLines = Math.max(1, Math.round(naturalHeight / naturalLineHeight));
  return targetHeight / visualLines;
}
