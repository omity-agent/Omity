import { type ToolSet, dynamicTool, jsonSchema } from "ai";
import type { ModelToolDefinition } from "../infrastructure/mcp/snapshot";
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
