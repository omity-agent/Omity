import { expect, test } from "bun:test";
import { createCodexOAuthFetch } from "openai-codex-oauth";
import { restrictedModelFetch } from "../../../src/agent/model/restrictedFetch";
import { z } from "zod";

test("Codex OAuth preserves explicit tool restrictions and hosted discovery", async () => {
  const requests: Record<string, unknown>[] = [],
    server = Bun.serve({
      async fetch(request) {
        expect(request.headers.get("authorization")).toBe("Bearer local-test");
        requests.push(z.record(z.string(), z.unknown()).parse(await request.json()));
        return Response.json({ accepted: true });
      },
      hostname: "127.0.0.1",
      port: 0,
    }),
    fetch = restrictedModelFetch(
      "responses",
      createCodexOAuthFetch({
        baseURL: server.url.href,
        originator: false,
        tokens: {
          accessToken: "local-test",
          accountId: "local-account",
          expiresAt: Date.now() + 3_600_000,
          refreshToken: "unused-test-token",
        },
      }),
    ),
    tools = [
      { execution: "server", type: "tool_search" },
      { defer_loading: true, name: "find_file", parameters: { type: "object" }, type: "function" },
    ];
  try {
    for (const declaredTools of [[], tools]) {
      const response = await fetch(new URL("responses", server.url), {
        body: JSON.stringify({
          input: [],
          instructions: "test",
          model: "test",
          tools: declaredTools,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      expect(await response.json()).toEqual({ accepted: true });
    }
    expect(requests).toEqual([
      {
        input: [],
        instructions: "test",
        model: "test",
        store: false,
        tool_choice: "none",
        tools: [],
      },
      { input: [], instructions: "test", model: "test", store: false, tool_choice: "auto", tools },
    ]);
  } finally {
    await server.stop(true);
  }
});
test.each([
  ["responses", { tools: [{ type: "code_interpreter" }] }],
  ["responses", { tools: [{ type: "file_search" }] }],
  ["responses", { tools: [{ type: "image_generation" }] }],
  ["responses", { tools: [{ type: "mcp" }] }],
  ["responses", { tools: [{ type: "future_server_tool" }] }],
  ["messages", { tools: [{ name: "code_execution", type: "code_execution_20250825" }] }],
  ["messages", { mcp_servers: [{ name: "remote", type: "url", url: "https://unused.invalid" }] }],
  ["messages", { container: { skills: [{ skill_id: "pptx", type: "anthropic" }] } }],
  ["completions", { web_search_options: {} }],
] as const)(
  "%s blocks forbidden tools and alternate server execution options: %j",
  async (api, options) => {
    let requests = 0;
    const server = Bun.serve({
      fetch() {
        requests += 1;
        return Response.json({ unexpected: true });
      },
      hostname: "127.0.0.1",
      port: 0,
    });
    try {
      expect(
        restrictedModelFetch(api)(server.url, {
          body: JSON.stringify({ model: "test", ...options }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
      ).rejects.toThrow("供应商内置工具已禁用");
      expect(requests).toBe(0);
    } finally {
      await server.stop(true);
    }
  },
);
