import { expect, test } from "bun:test";

import { z } from "zod";

import { createResponsesWebsocketFetch } from "../../../src/agent/model/responsesWebsocket";
import { restrictedModelFetch } from "../../../src/agent/model/restrictedFetch";
import { createNetworkRuntime } from "../../../src/infrastructure/network/installNetworking";
import { createCodexConnection } from "../../../src/infrastructure/openai/oauthConnection";
import { createOAuthFile } from "../../infrastructure/openai/authSessionFixture";

test("Codex OAuth preserves explicit tool restrictions and hosted discovery", async () => {
  using auth = await createOAuthFile({ accessToken: "local-test", accountId: "local-account" });
  const requests: Record<string, unknown>[] = [],
    server = Bun.serve({
      fetch(request, listener) {
        expect(request.headers.get("authorization")).toBe("Bearer local-test");
        return listener.upgrade(request) ? undefined : new Response(null, { status: 404 });
      },
      hostname: "127.0.0.1",
      port: 0,
      websocket: {
        message(socket, data) {
          requests.push(z.record(z.string(), z.unknown()).parse(JSON.parse(String(data))));
          socket.send(
            JSON.stringify({ response: { id: "tool-policy" }, type: "response.completed" }),
          );
          socket.close(1000);
        },
      },
    }),
    runtime = createNetworkRuntime(async () => undefined),
    previousFetch = globalThis.fetch,
    connection = createCodexConnection({ authFilePath: auth.path, codexVersion: "0.154.4" }),
    fetch = restrictedModelFetch("responses", createResponsesWebsocketFetch(connection.websocket)),
    tools = [
      { execution: "server", type: "tool_search" },
      { defer_loading: true, name: "find_file", parameters: { type: "object" }, type: "function" },
    ];
  globalThis.fetch = runtime.fetch;
  try {
    for (const declaredTools of [[], tools]) {
      const response = await fetch(new URL("responses", server.url), {
        body: JSON.stringify({
          input: [],
          instructions: "test",
          model: "test",
          store: false,
          tools: declaredTools,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      expect(await response.text()).toContain("event: response.completed");
    }
    expect(requests).toEqual([
      {
        input: [],
        instructions: "test",
        model: "test",
        store: false,
        stream: true,
        tool_choice: "none",
        tools: [],
        type: "response.create",
      },
      {
        input: [],
        instructions: "test",
        model: "test",
        store: false,
        stream: true,
        tool_choice: "auto",
        tools,
        type: "response.create",
      },
    ]);
  } finally {
    globalThis.fetch = previousFetch;
    await runtime.close();
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
