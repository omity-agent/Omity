import type { FilePathMatch } from "../../../../fileLinks/types";

export function normalizeCodeMatches(code: string, matches: FilePathMatch[]) {
  return {
    code: normalizeLineBreaks(code),
    matches: matches.map((match) => ({
      ...match,
      position: {
        end: normalizedOffset(code, match.position.end),
        start: normalizedOffset(code, match.position.start),
      },
    })),
  };
}
export function normalizeLineBreaks(code: string) {
  return code.replace(/\r\n?|\u2028|\u2029/gu, "\n");
}
function normalizedOffset(code: string, offset: number) {
  return normalizeLineBreaks(code.slice(0, offset)).length;
}
