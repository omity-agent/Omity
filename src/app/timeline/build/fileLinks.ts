import type { FileLinkSet, FileLinkSurface, FilePathMatch } from "../../../fileLinks/types";
import type { DisplayToolCall, DisplayToolOutput } from "../contracts/projection";

export function linkedCall(call: DisplayToolCall, fileLinks: FileLinkSet[]) {
  return {
    ...call,
    ...optionalLinks(matchesFor(fileLinks, call.id, "tool_input")),
  };
}
export function linkedOutput(output: DisplayToolOutput, callId: string, fileLinks: FileLinkSet[]) {
  return {
    ...output,
    ...optionalLinks(matchesFor(fileLinks, callId, "tool_output")),
  };
}
export function matchesFor(
  fileLinks: FileLinkSet[],
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
