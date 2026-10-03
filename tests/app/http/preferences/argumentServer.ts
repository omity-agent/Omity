import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const [toolName] = process.argv.slice(2);
if (!toolName) {
  throw new Error("MCP 集成夹具缺少工具名称");
}
const server = new McpServer({ name: "session-preferences", version: "1" });
server.registerTool(toolName, { inputSchema: { input: z.string() } }, ({ input }) => ({
  content: [{ text: JSON.stringify({ cwd: process.cwd(), input }), type: "text" }],
}));
await server.connect(new StdioServerTransport());
