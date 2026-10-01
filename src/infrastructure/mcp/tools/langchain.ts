import { ToolException, type loadMcpTools } from "@langchain/mcp-adapters";
import type { McpOperations } from "../client/protocol";

type LangChainClient = Parameters<typeof loadMcpTools>[1];
export function langChainClient(client: McpOperations): LangChainClient {
  const adapter: Pick<LangChainClient, keyof McpOperations> = {
    async callTool(params, options) {
      let result: Awaited<ReturnType<McpOperations["callTool"]>>;
      try {
        result = await client.callTool(params, options);
      } catch (error) {
        throw new ToolException(errorMessage(error), error);
      }
      if (result.isError) {
        throw new ToolException(
          result.content
            .map((block) => (block.type === "text" ? block.text : JSON.stringify(block)))
            .join("\n") || "MCP 工具返回了错误",
        );
      }
      return result;
    },
    getProtocolEra: () => client.getProtocolEra(),
    listTools: (params, options) => client.listTools(params, options),
    readResource: (params, options) => client.readResource(params, options),
  };
  // loadMcpTools 仅调用 MCP 操作，但依赖的类型要求完整的 SDK Client 实例。
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return adapter as LangChainClient;
}
function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  return String(error);
}
