import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const [endpoint, name] = process.argv.slice(2);
if (!endpoint || !name) {
  throw new Error("MCP 测试子进程缺少协调地址或服务器名称");
}
async function checkpoint(phase: string) {
  const response = await fetch(`${endpoint}/${name}/${phase}?pid=${process.pid.toString()}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
}
const server = new McpServer({ name, version: "1" });
for (const toolName of ["identity", "hidden"]) {
  server.registerTool(toolName, {}, () => ({
    content: [{ text: JSON.stringify({ cwd: process.cwd(), pid: process.pid }), type: "text" }],
  }));
}
server.server.setRequestHandler(ListToolsRequestSchema, async () => {
  try {
    await checkpoint("tools");
  } finally {
    await checkpoint("listed");
  }
  return {
    tools: ["identity", "hidden"].map((toolName) => ({
      inputSchema: { properties: {}, type: "object" as const },
      name: toolName,
    })),
  };
});
await checkpoint("boot");
await server.connect(new StdioServerTransport());
