import type { DisplayToolCall, DisplayToolOutput } from "../types";
import type { FileLinkSurface, FileLinkUnit, FilePathMatch } from "../../../fileLinks/types";

export function linkedCall(call: DisplayToolCall, fileLinks: FileLinkUnit[]) {
  return {
    ...call,
    ...optionalLinks(matchesFor(fileLinks, call.id, "tool_input")),
  };
}
export function linkedOutput(output: DisplayToolOutput, callId: string, fileLinks: FileLinkUnit[]) {
  return {
    ...output,
    ...optionalLinks(matchesFor(fileLinks, callId, "tool_output")),
  };
}
export function matchesFor(
  fileLinks: FileLinkUnit[],
  ownerId: string | undefined,
  surface: FileLinkSurface,
) {
  return ownerId
    ? fileLinks
        .filter((unit) => unit.ownerId === ownerId && unit.surface === surface)
        .flatMap((unit) => unit.matches)
    : [];
}
export function optionalLinks(matches: FilePathMatch[]) {
  return matches.length > 0 ? { fileLinks: matches } : {};
}
