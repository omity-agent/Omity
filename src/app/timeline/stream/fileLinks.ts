import type { FileLinkSet, FilePathMatch } from "../../../fileLinks/types";

export function localStreamLinks(
  fileLinks: FileLinkSet[],
  ownerId: string,
  surface: "content" | "reasoning",
  part: { content: string; offset: number },
) {
  return fileLinks
    .filter((link) => link.ownerId === ownerId && link.surface === surface)
    .flatMap((unit) =>
      unit.matches
        .filter(
          (match) =>
            match.position.start >= part.offset &&
            match.position.end <= part.offset + part.content.length,
        )
        .map((match) =>
          Object.assign(match, {
            position: {
              end: match.position.end - part.offset,
              start: match.position.start - part.offset,
            },
          }),
        ),
    );
}
export function optionalStreamLinks(matches: FilePathMatch[]) {
  return matches.length > 0 ? { fileLinks: matches } : {};
}
