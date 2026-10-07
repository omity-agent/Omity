import { isPlainObject as isRecord } from "es-toolkit";
import { localize } from "../../../i18n/server";

export function structuredToolOutput(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const matches = value.filter(isStructuredArtifact);
  if (matches.length > 1) {
    throw new Error(localize("mcp:structured.multipleArtifacts"));
  }
  const [artifact] = matches;
  if (!artifact) {
    return undefined;
  }
  if (!("data" in artifact)) {
    throw new Error(localize("mcp:structured.dataMissing"));
  }
  return artifact["data"];
}
export function structuredOutputArtifact(data: unknown) {
  return [{ data, type: "mcp_structured_content" }];
}
function isStructuredArtifact(
  value: unknown,
): value is Record<string, unknown> & { type: "mcp_structured_content" } {
  return isRecord(value) && value["type"] === "mcp_structured_content";
}
