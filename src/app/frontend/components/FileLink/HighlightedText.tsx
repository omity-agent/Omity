import { type CSSProperties, useMemo } from "react";
import { FileLinkMenu } from "./Menu";
import type { FilePathMatch } from "../../../../fileLinks/types";
import { chunkBy } from "es-toolkit";

interface HighlightToken {
  className?: string;
  style?: CSSProperties;
  text: string;
}
interface HighlightPiece extends HighlightToken {
  link?: Pick<FilePathMatch, "kind" | "path">;
}
export function HighlightedText({ html, matches }: { html: string; matches: FilePathMatch[] }) {
  const pieces = useMemo(() => splitTokens(readTokens(html), matches), [html, matches]);
  return <>{groupPieces(pieces)}</>;
}
function readTokens(html: string) {
  const document = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html"),
    tokens: HighlightToken[] = [];
  walk(document.body, [], {}, tokens);
  return tokens;
}
function walk(
  node: Node,
  inheritedClasses: string[],
  inheritedStyle: CSSProperties,
  tokens: HighlightToken[],
) {
  if (node.nodeType === Node.TEXT_NODE) {
    if (node.textContent) {
      tokens.push({
        ...(inheritedClasses.length > 0 ? { className: inheritedClasses.join(" ") } : {}),
        ...(Object.keys(inheritedStyle).length > 0 ? { style: inheritedStyle } : {}),
        text: node.textContent,
      });
    }
    return;
  }
  const ownClasses = node instanceof Element ? [...node.classList] : [],
    classes = [...inheritedClasses, ...ownClasses],
    style = node instanceof HTMLElement ? mergeStyle(inheritedStyle, node.style) : inheritedStyle;
  for (const child of node.childNodes) {
    walk(child, classes, style, tokens);
  }
}
function mergeStyle(inherited: CSSProperties, style: CSSStyleDeclaration): CSSProperties {
  return {
    ...inherited,
    ...(style.color ? { color: style.color } : {}),
    ...(style.fontStyle ? { fontStyle: style.fontStyle } : {}),
    ...(style.fontWeight ? { fontWeight: style.fontWeight } : {}),
    ...(style.textDecoration ? { textDecoration: style.textDecoration } : {}),
  };
}
function splitTokens(tokens: HighlightToken[], matches: FilePathMatch[]) {
  const normalized = nonOverlapping(matches),
    pieces: HighlightPiece[] = [];
  let offset = 0;
  for (const token of tokens) {
    const tokenEnd = offset + token.text.length,
      boundaries = new Set([offset, tokenEnd]);
    for (const match of normalized) {
      if (match.position.start > offset && match.position.start < tokenEnd) {
        boundaries.add(match.position.start);
      }
      if (match.position.end > offset && match.position.end < tokenEnd) {
        boundaries.add(match.position.end);
      }
    }
    const points = [...boundaries].toSorted((left, right) => left - right);
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index] ?? offset,
        end = points[index + 1] ?? tokenEnd,
        match = normalized.find(
          (candidate) => candidate.position.start <= start && candidate.position.end >= end,
        );
      pieces.push({
        ...token,
        ...(match ? { link: { kind: match.kind, path: match.path } } : {}),
        text: token.text.slice(start - offset, end - offset),
      });
    }
    offset = tokenEnd;
  }
  return pieces;
}
function nonOverlapping(matches: FilePathMatch[]) {
  let end = -1;
  return matches
    .toSorted(
      (left, right) =>
        left.position.start - right.position.start || right.position.end - left.position.end,
    )
    .filter((match) => {
      if (match.position.start < end) {
        return false;
      }
      ({ end } = match.position);
      return true;
    });
}
function groupPieces(pieces: HighlightPiece[]) {
  return chunkBy(pieces, ({ link }) => link && `${link.kind}:${link.path}`).flatMap(
    (group, index) => {
      const { link } = group[0]!,
        children = group.map(tokenNode);
      return link ? (
        <FileLinkMenu key={`path-${index.toString()}`} kind={link.kind} path={link.path}>
          {children}
        </FileLinkMenu>
      ) : (
        children
      );
    },
  );
}
function tokenNode(token: HighlightPiece, index: number) {
  return (
    <span className={token.className} key={index} style={token.style}>
      {token.text}
    </span>
  );
}
