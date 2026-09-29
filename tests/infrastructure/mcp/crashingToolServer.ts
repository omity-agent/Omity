import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({ name: "crash-recovery", version: "1" });
server.registerTool("identity", {}, async () => ({
  content: [{ text: process.pid.toString(), type: "text" }],
}));
server.registerTool("crash", {}, async () => {
  const pending = Promise.withResolvers<never>();
  process.stderr.write("intentional tool process crash", () => process.exit(23));
  return pending.promise;
});
await server.connect(new StdioServerTransport());
