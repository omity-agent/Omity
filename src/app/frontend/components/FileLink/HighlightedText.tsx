import { Fragment, type ReactNode, useMemo } from "react";
import { FileLinkMenu } from "./Menu";
import type { FilePathMatch } from "../../../../fileLinks/types";

interface HighlightToken {
  className?: string;
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
  const document = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const tokens: HighlightToken[] = [];
  walk(document.body, [], tokens);
  return tokens;
}
function walk(node: Node, inherited: string[], tokens: HighlightToken[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    if (node.textContent) {
      tokens.push({
        ...(inherited.length > 0 ? { className: inherited.join(" ") } : {}),
        text: node.textContent,
      });
    }
    return;
  }
  const own = node instanceof Element ? [...node.classList] : [];
  const classes = [...inherited, ...own];
  for (const child of node.childNodes) {
    walk(child, classes, tokens);
  }
}
function splitTokens(tokens: HighlightToken[], matches: FilePathMatch[]) {
  const normalized = nonOverlapping(matches);
  const pieces: HighlightPiece[] = [];
  let offset = 0;
  for (const token of tokens) {
    const tokenEnd = offset + token.text.length;
    const boundaries = new Set([offset, tokenEnd]);
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
      const start = points[index] ?? offset;
      const end = points[index + 1] ?? tokenEnd;
      const match = normalized.find(
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
  const result: ReactNode[] = [];
  for (let index = 0; index < pieces.length;) {
    const piece = pieces[index];
    if (!piece) {
      break;
    }
    const { link } = piece;
    if (!link) {
      result.push(tokenNode(piece, index));
      index += 1;
    } else {
      const children: ReactNode[] = [];
      for (;;) {
        const current = pieces[index];
        if (!current?.link || current.link.kind !== link.kind || current.link.path !== link.path) {
          break;
        }
        children.push(tokenNode(current, index));
        index += 1;
      }
      result.push(
        <FileLinkMenu key={`path-${index.toString()}`} kind={link.kind} path={link.path}>
          {children}
        </FileLinkMenu>,
      );
    }
  }
  return result;
}
function tokenNode(token: HighlightPiece, index: number) {
  return token.className ? (
    <span className={token.className} key={index}>
      {token.text}
    </span>
  ) : (
    <Fragment key={index}>{token.text}</Fragment>
  );
}
