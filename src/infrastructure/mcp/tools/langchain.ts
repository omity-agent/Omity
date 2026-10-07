import { ToolException, type loadMcpTools } from "@langchain/mcp-adapters";
import type { McpOperations } from "../client/protocol";
import { localize } from "../../../i18n/server";

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
            .join("\n") || localize("mcp:tools.executionFailed"),
        );
      }
      return result;
    },
    getProtocolEra: () => client.getProtocolEra(),
    listTools: (params, options) => client.listTools(params, options),
    readResource: (params, options) => client.readResource(params, options),
  };
  // loadMcpTools only invokes MCP operations but requires a complete SDK Client instance by type.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return adapter as LangChainClient;
}
function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  return String(error);
}
