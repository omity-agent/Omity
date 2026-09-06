import { Fragment, useLayoutEffect, useMemo, useRef } from "react";
import { HighlightedLine, codeLines } from "../HighlightedCode/lines";
import { fitSourceHeight, observeSourceSpace } from "./fittedSource";
import type { FilePathMatch } from "../../../../fileLinks/types";
import { css } from "styled-system/css";
import { highlightMarkdownSource } from "./syntax";
import { source } from "./styles";

const noFileLinks: FilePathMatch[] = [],
  container = css({ inset: 0, overflow: "clip", position: "absolute" });
export function MarkdownSource({
  content,
  fileLinks = noFileLinks,
}: {
  content: string;
  fileLinks?: FilePathMatch[];
}) {
  const lines = useMemo(() => codeLines(content, fileLinks), [content, fileLinks]),
    highlight = useMemo(() => highlightMarkdownSource(content), [content]),
    sourceReference = useRef<HTMLPreElement>(null),
    containerReference = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = sourceReference.current,
      parent = containerReference.current;
    if (!element || !parent) {
      throw new Error("Markdown 源码测量元素未挂载");
    }
    fitSourceHeight(element, parent.getBoundingClientRect().height);
  });
  useLayoutEffect(() => {
    const element = sourceReference.current,
      parent = containerReference.current;
    if (!element || !parent) {
      throw new Error("Markdown 源码测量元素未挂载");
    }
    return observeSourceSpace(parent, element);
  }, []);
  return (
    <div className={container} ref={containerReference}>
      <pre className={source} ref={sourceReference}>
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
