import { CallToolResultSchema, ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { McpOperations } from "../client/protocol";
import type { loadMcpTools } from "@langchain/mcp-adapters";

type LangChainClient = Parameters<typeof loadMcpTools>[1];
export function langChainClient(client: McpOperations): LangChainClient {
  const adapter: Pick<LangChainClient, keyof McpOperations> = {
    async callTool(params, _schema, options) {
      let result: Awaited<ReturnType<McpOperations["callTool"]>>;
      try {
        result = await client.callTool(params, options);
      } catch (error) {
        throw createMcpToolFailure(errorMessage(error), error);
      }
      if (result.isError) {
        throw createMcpToolFailure(
          result.content
            .map((block) => (block.type === "text" ? block.text : JSON.stringify(block)))
            .join("\n") || "MCP 工具返回了错误",
        );
      }
      return CallToolResultSchema.parse(result);
    },
    listTools: async (params, options) =>
      ListToolsResultSchema.parse(await client.listTools(params, options)),
    readResource: (params, options) => client.readResource(params, options),
  };
  // loadMcpTools 仅调用这三个方法，但依赖的类型要求完整的 SDK Client 实例。
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return adapter as LangChainClient;
}
function createMcpToolFailure(message: string, cause?: unknown) {
  const error = new Error(message, cause === undefined ? undefined : { cause });
  error.name = "ToolException";
  return error;
}
function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  return String(error);
}
