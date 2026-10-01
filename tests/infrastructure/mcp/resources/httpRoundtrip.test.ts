import { expect, test } from "bun:test";
import { Logger } from "../../../../src/infrastructure/logging/logger";
import { McpClientPool } from "../../../../src/infrastructure/mcp/client/pool";
import { ToolMessage } from "@langchain/core/messages";
import { loadServerTools } from "../../../../src/infrastructure/mcp/loadServers";
import { structuredToolOutput } from "../../../../src/infrastructure/mcp/tools/structured";
import { z } from "zod";

test.each(["modern", "legacy"] as const)(
  "%s HTTP catalog owns one connection and preserves multimodal results and tool errors",
  async (era) => {
    const methods: string[] = [],
      server = Bun.serve({
        async fetch(request) {
          expect(request.headers.get("authorization")).toBe("Bearer test-secret");
          if (request.method !== "POST") {
            return new Response(null, { status: 405 });
          }
          const body = requestSchema.parse(await request.json());
          methods.push(body.method);
          if (body.method === "tools/call" && body.params?.["name"] === "unavailable") {
            return new Response("upstream unavailable", { status: 503 });
          }
          if (body.id === undefined) {
            return new Response(null, { status: 202 });
          }
          const result = responseFor(era, body);
          return Response.json({ id: body.id, jsonrpc: "2.0", ...result });
        },
        port: 0,
      }),
      configuration = {
        remote: {
          headers: { Authorization: "Bearer test-secret" },
          url: `http://127.0.0.1:${server.port!.toString()}/mcp`,
        },
      },
      pool = new McpClientPool(
        configuration,
        { delayMs: 0, maxAttempts: 1 },
        new Logger("error", true),
        process.cwd(),
      );
    try {
      const [first, second] = await Promise.all([
        pool.getClient("remote"),
        pool.getClient("remote"),
      ]);
      expect(first).toBe(second);
      expect(first.getProtocolEra()).toBe(era);
      expect(methods.filter((method) => method === "server/discover")).toHaveLength(1);
      expect(methods.filter((method) => method === "initialize")).toHaveLength(
        era === "legacy" ? 1 : 0,
      );
      expect(methods).not.toContain("tools/list");
      const tools = await loadServerTools(pool, configuration);
      expect(methods.filter((method) => method === "tools/list")).toHaveLength(1);
      expect(tools.map(({ name }) => name)).toEqual([
        "remote__echo",
        "remote__reject",
        "remote__unavailable",
      ]);
      const result: unknown = await tools[0]!.invoke({
        args: {},
        id: "call-1",
        name: "remote__echo",
        type: "tool_call",
      });
      expect(ToolMessage.isInstance(result)).toBe(true);
      if (!ToolMessage.isInstance(result)) {
        throw new Error("工具适配器未生成 ToolMessage");
      }
      expect(result.content).toEqual([
        { text: "result", type: "text" },
        { data: "AA==", mimeType: "image/png", type: "image" },
      ]);
      expect(structuredToolOutput(result.artifact)).toEqual({ answer: 42 });
      expect(result.artifact).toContainEqual({
        resource: { mimeType: "text/plain", text: "resource", uri: "file:///result.txt" },
        type: "resource",
      });
      expect(tools[1]!.invoke({})).rejects.toThrow("tool rejected");
      expect(tools[2]!.invoke({})).rejects.toThrow("upstream unavailable");
      expect(methods.filter((method) => method === "tools/call")).toHaveLength(3);
    } finally {
      await pool.close();
      await server.stop(true);
    }
  },
);
const requestSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});
function responseFor(era: "modern" | "legacy", request: z.infer<typeof requestSchema>) {
  if (request.method === "server/discover") {
    return era === "legacy"
      ? { error: { code: -32_601, message: "Method not found" } }
      : {
          result: {
            _meta: {
              "io.modelcontextprotocol/serverInfo": { name: "roundtrip", version: "1" },
            },
            capabilities: { tools: {} },
            resultType: "complete",
            supportedVersions: ["2026-07-28"],
          },
        };
  }
  if (request.method === "initialize") {
    return {
      result: {
        capabilities: { tools: {} },
        protocolVersion: request.params?.["protocolVersion"],
        serverInfo: { name: "roundtrip", version: "1" },
      },
    };
  }
  const completion =
    era === "modern" ? { cacheScope: "private", resultType: "complete", ttlMs: 0 } : {};
  if (request.method === "tools/list") {
    return {
      result: {
        ...completion,
        tools: ["echo", "reject", "unavailable"].map((name) => ({
          inputSchema: { properties: {}, type: "object" },
          name,
        })),
      },
    };
  }
  return {
    result: {
      ...completion,
      ...(request.params?.["name"] === "reject"
        ? { content: [{ text: "tool rejected", type: "text" }], isError: true }
        : {
            content: [
              { text: "result", type: "text" },
              { data: "AA==", mimeType: "image/png", type: "image" },
              {
                resource: {
                  mimeType: "text/plain",
                  text: "resource",
                  uri: "file:///result.txt",
                },
                type: "resource",
              },
            ],
            structuredContent: { answer: 42 },
          }),
    },
  };
}
