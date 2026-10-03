import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({ name: "session-preferences", version: "1" });
server.registerTool("identity", {}, () => ({
  content: [{ text: process.cwd(), type: "text" }],
}));
await server.connect(new StdioServerTransport());
