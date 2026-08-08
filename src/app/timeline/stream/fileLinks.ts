import type { FileLinkUnit, FilePathMatch } from "../../../fileLinks/types";

export function localStreamLinks(
  fileLinks: FileLinkUnit[],
  ownerId: string,
  surface: "content" | "reasoning",
  part: { content: string; offset: number },
) {
  return fileLinks
    .filter(
      (unit) =>
        unit.ownerId === ownerId &&
        unit.surface === surface &&
        unit.start >= part.offset &&
        unit.end <= part.offset + part.content.length,
    )
    .flatMap((unit) =>
      unit.matches.map((match) => ({
        ...match,
        position: {
          end: match.position.end - part.offset,
          start: match.position.start - part.offset,
        },
      })),
    );
}
export function optionalStreamLinks(matches: FilePathMatch[]) {
  return matches.length > 0 ? { fileLinks: matches } : {};
}
