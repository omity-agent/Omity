import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { z } from "zod";

const [path] = process.argv.slice(2);
assert(path, "缺少性能测试工具定义文件");
const tools = z
    .array(
      z.object({
        description: z.string(),
        inputSchema: z.object({
          properties: z.record(z.string(), z.unknown()),
          type: z.literal("object"),
        }),
        name: z.string(),
      }),
    )
    .parse(JSON.parse(await readFile(path, "utf8")) as unknown),
  server = new McpServer({ name: "latency-noop", version: "1.0.0" });
for (const tool of tools) {
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: { input: z.string().optional() },
    },
    async () => ({ content: [] }),
  );
}
await server.connect(new StdioServerTransport());
