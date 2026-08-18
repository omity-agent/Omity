import { type ToolSet, dynamicTool } from "ai";
import type { ModelToolDefinition } from "../infrastructure/mcp/snapshot";
import { jsonSchema } from "@ai-sdk/provider-utils";
import { openai } from "@ai-sdk/openai";

export function aiModelTools(tools: ModelToolDefinition[]): ToolSet {
  return Object.fromEntries(
    tools.map((tool) => [
      tool.name,
      tool.freeform
        ? openai.tools.customTool({
            description: tool.description,
            format: { type: "text" },
          })
        : dynamicTool({
            description: tool.description,
            inputSchema: jsonSchema(tool.inputSchema),
          }),
    ]),
  );
}
