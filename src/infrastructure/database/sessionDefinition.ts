import { type McpSnapshot, emptyMcpSnapshot, snapshotMcp } from "../mcp/snapshot";
import type { LoadedMcp } from "../mcp/loadTools";

export interface SessionDefinition {
  mcp: McpSnapshot;
  systemPrompt: string;
}
export function createSessionDefinition(
  systemPrompt: string,
  mcp: LoadedMcp,
  session: { cwd: string; session: string },
): SessionDefinition {
  return { mcp: snapshotMcp(mcp, session), systemPrompt };
}
export function emptySessionDefinition(): SessionDefinition {
  return { mcp: emptyMcpSnapshot(), systemPrompt: "" };
}
