import { expect, test } from "bun:test";
import { isPlainObject } from "es-toolkit";
import { startRecordingProxy } from "./localProxyFixture";

test("model, Codex refresh and HTTP MCP requests all use the installed network policy", async () => {
  const paths: string[] = [],
    target = Bun.serve({
      async fetch(request) {
        const { pathname } = new URL(request.url);
        paths.push(pathname);
        if (pathname === "/chat/completions") {
          return Response.json({
            choices: [
              {
                finish_reason: "stop",
                index: 0,
                message: { content: "model-ok", role: "assistant" },
              },
            ],
            created: 1,
            id: "test-completion",
            model: "test",
            usage: { completion_tokens: 1, prompt_tokens: 1, total_tokens: 2 },
          });
        }
        if (pathname === "/token") {
          return Response.json({
            access_token: "fresh-test-token",
            expires_in: 3600,
            token_type: "Bearer",
          });
        }
        if (pathname === "/responses") {
          expect(request.headers.get("authorization")).toBe("Bearer fresh-test-token");
          return new Response("codex-ok");
        }
        if (pathname !== "/mcp") {
          return new Response(null, { status: 404 });
        }
        if (request.method !== "POST") {
          return new Response(null, { status: request.method === "DELETE" ? 204 : 405 });
        }
        const body: unknown = await request.json();
        if (!isPlainObject(body)) {
          throw new Error("MCP 测试请求格式错误");
        }
        if (!("id" in body)) {
          return new Response(null, { status: 202 });
        }
        const { params } = body,
          protocolVersion = isPlainObject(params) ? params["protocolVersion"] : undefined;
        return Response.json({
          id: body["id"],
          jsonrpc: "2.0",
          result:
            body["method"] === "initialize"
              ? {
                  capabilities: { tools: {} },
                  protocolVersion,
                  serverInfo: { name: "proxy-test", version: "1" },
                }
              : { tools: [] },
        });
      },
      port: 0,
    }),
    proxy = await startRecordingProxy(target.port!);
  try {
    const child = Bun.spawn([process.execPath, "run", `${import.meta.dir}/consumerRequests.ts`], {
        env: {
          ...process.env,
          ALL_PROXY: "",
          HTTPS_PROXY: proxy.url,
          HTTP_PROXY: proxy.url,
          NO_PROXY: "",
          TEST_KEY: "test-key",
          all_proxy: "",
          http_proxy: proxy.url,
          https_proxy: proxy.url,
          no_proxy: "",
        },
        stderr: "pipe",
        stdout: "pipe",
      }),
      [status, output, error] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
    expect({ error, status }).toEqual({ error: "", status: 0 });
    expect(output).toContain("model-ok");
    expect(output).toContain("codex-ok");
    expect(paths).toContain("/chat/completions");
    expect(paths).toContain("/token");
    expect(paths).toContain("/responses");
    expect(paths).toContain("/mcp");
    expect(new Set(proxy.requests.map(({ authority }) => authority))).toEqual(
      new Set(["model.invalid:80", "auth.invalid:80", "codex.invalid:80", "tools.invalid:80"]),
    );
  } finally {
    await proxy.close();
    await target.stop(true);
  }
}, 15_000);
