import type { Link, Nodes, PhrasingContent, Root, Text } from "mdast";
import type { FilePathMatch } from "../../../../fileLinks/types";
import type { Plugin } from "unified";

const marker = "#omity-file=";
interface PositionedNode {
  position?: {
    end: { offset?: number };
    start: { offset?: number };
  };
}
interface TreeParent {
  children: Nodes[];
}
export function fileLinkRemark(matches: FilePathMatch[]): Plugin<[], Root> {
  return () => (tree) => {
    transformChildren(tree, matches, false);
  };
}
export function fileLinkHref(path: string) {
  return `${marker}${encodeURIComponent(path)}`;
}
export function pathFromFileLinkHref(href?: string) {
  return href?.startsWith(marker) ? decodeURIComponent(href.slice(marker.length)) : undefined;
}
export function matchInsideNode(node: PositionedNode | undefined, matches: FilePathMatch[]) {
  const start = node?.position?.start.offset;
  const end = node?.position?.end.offset;
  if (start === undefined || end === undefined) {
    return undefined;
  }
  return matches.find((match) => match.position.start >= start && match.position.end <= end);
}
export function localizeMatches(
  code: string,
  source: string,
  node: PositionedNode | undefined,
  matches: FilePathMatch[],
) {
  const start = node?.position?.start.offset;
  const end = node?.position?.end.offset;
  if (start === undefined || end === undefined) {
    return [];
  }
  let cursor = 0;
  return matches.flatMap((match): FilePathMatch[] => {
    if (match.position.start < start || match.position.end > end) {
      return [];
    }
    const value = source.slice(match.position.start, match.position.end);
    const localStart = code.indexOf(value, cursor);
    if (localStart === -1) {
      return [];
    }
    cursor = localStart + value.length;
    return [
      {
        ...match,
        position: { end: cursor, start: localStart },
      },
    ];
  });
}
function transformChildren(parent: TreeParent, matches: FilePathMatch[], insideLink: boolean) {
  const transformed: Nodes[] = [];
  for (const child of parent.children) {
    if (child.type === "text" && !insideLink) {
      transformed.push(...splitText(child, matches));
    } else {
      if ("children" in child) {
        transformChildren(child, matches, insideLink || child.type === "link");
      }
      transformed.push(child);
    }
  }
  parent.children = transformed;
}
function splitText(node: Text, matches: FilePathMatch[]): PhrasingContent[] {
  const nodeStart = node.position?.start.offset;
  const nodeEnd = node.position?.end.offset;
  if (nodeStart === undefined || nodeEnd === undefined) {
    return [node];
  }
  const contained = matches.filter(
    (match) => match.position.start >= nodeStart && match.position.end <= nodeEnd,
  );
  if (contained.length === 0) {
    return [node];
  }
  const result: PhrasingContent[] = [];
  let cursor = 0;
  for (const match of contained) {
    const start = match.position.start - nodeStart;
    const end = match.position.end - nodeStart;
    appendText(result, node.value.slice(cursor, start));
    result.push(fileLinkNode(node.value.slice(start, end), match.path));
    cursor = end;
  }
  appendText(result, node.value.slice(cursor));
  return result;
}
function appendText(nodes: PhrasingContent[], value: string) {
  if (value) {
    nodes.push({ type: "text", value });
  }
}
function fileLinkNode(value: string, path: string): Link {
  return {
    children: [{ type: "text", value }],
    type: "link",
    url: fileLinkHref(path),
  };
}
