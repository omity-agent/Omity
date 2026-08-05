import { type ToolSet, dynamicTool } from "ai";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { jsonSchema } from "@ai-sdk/provider-utils";
import { openai } from "@ai-sdk/openai";
import { toJsonSchema } from "@langchain/core/utils/json_schema";

export function aiModelTools(
  tools: StructuredToolInterface[],
  freeformToolParameters: ReadonlyMap<string, string>,
): ToolSet {
  return Object.fromEntries(
    tools.map((tool) => [
      tool.name,
      freeformToolParameters.has(tool.name)
        ? openai.tools.customTool({
            description: tool.description,
            format: { type: "text" },
          })
        : dynamicTool({
            description: tool.description,
            inputSchema: jsonSchema(toJsonSchema(tool.schema)),
          }),
    ]),
  );
}
