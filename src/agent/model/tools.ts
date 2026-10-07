import { type ToolSet, dynamicTool, jsonSchema } from "ai";
import type { ModelApi } from "../../types";
import type { ModelToolDefinition } from "../../infrastructure/mcp/tools/definitions";
import { anthropic } from "@ai-sdk/anthropic";
import { localize } from "../../i18n/server";
import { openai } from "@ai-sdk/openai";

export function aiModelTools(tools: ModelToolDefinition[], api: ModelApi): ToolSet {
  const deferred = tools.some((tool) => tool.deferLoading);
  if (deferred && api !== "responses" && api !== "messages") {
    throw new Error(localize("agent:model.deferredToolsUnsupported"));
  }
  for (const tool of tools) {
    if (tool.freeform && (tool.deferLoading || api !== "responses")) {
      throw new Error(localize("agent:model.freeformToolPolicyInvalid", { value0: tool.name }));
    }
  }
  const result: ToolSet = Object.fromEntries(
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
            ...(tool.deferLoading
              ? {
                  providerOptions: {
                    [api === "messages" ? "anthropic" : "openai"]: { deferLoading: true },
                  },
                }
              : {}),
          }),
    ]),
  );
  if (deferred) {
    const name = api === "messages" ? "tool_search_tool_regex" : "tool_search";
    if (Object.hasOwn(result, name)) {
      throw new Error(localize("agent:model.searchToolNameConflict", { value0: name }));
    }
    result[name] =
      api === "messages"
        ? anthropic.tools.toolSearchRegex_20251119()
        : openai.tools.toolSearch({ execution: "server" });
  }
  return result;
}
