import { type ToolSet, dynamicTool, jsonSchema } from "ai";
import type { ModelApi } from "../../types";
import type { ModelToolDefinition } from "../../infrastructure/mcp/tools/definitions";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";

export function aiModelTools(tools: ModelToolDefinition[], api: ModelApi): ToolSet {
  const deferred = tools.some((tool) => tool.deferLoading);
  if (deferred && api === "completions") {
    throw new Error("Defer loading 仅支持 Responses API 和 Messages API");
  }
  for (const tool of tools) {
    if (tool.freeform && (tool.deferLoading || api !== "responses")) {
      throw new Error(`工具 ${tool.name} 的 free-form 输入仅支持非延迟加载的 Responses API 工具`);
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
      throw new Error(`延迟加载的服务端搜索工具名称冲突：${name}`);
    }
    result[name] =
      api === "messages"
        ? anthropic.tools.toolSearchRegex_20251119()
        : openai.tools.toolSearch({ execution: "server" });
  }
  return result;
}
