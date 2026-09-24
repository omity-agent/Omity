import { expect, test } from "bun:test";
import { codexProtocol } from "../../../settings/openai/codexProtocol";
import { createCodexClientFields } from "../../../src/infrastructure/openai/codexAuthentication";
import { createNetworkRuntime } from "../../../src/infrastructure/network/installNetworking";
import { createOpenAI } from "@ai-sdk/openai";

test("Codex sends upstream HTTP headers without AI SDK or Fetch defaults on the wire", async () => {
  const received: Headers[] = [],
    server = Bun.serve({
      async fetch(request) {
        received.push(new Headers(request.headers));
        const body = Bun.zstdDecompressSync(await request.arrayBuffer()).toString();
        expect(JSON.parse(body)).toMatchObject({ model: "test-model" });
        return new Response("data: [DONE]\n\n", {
          headers: { "content-type": "text/event-stream" },
        });
      },
      port: 0,
    }),
    runtime = createNetworkRuntime(async () => undefined);
  try {
    const fields = createCodexClientFields({
        fetch: (_input, init, policy) => runtime.fetch(server.url, init, policy),
        tokenStore: {
          load: async () => ({ accessToken: "test-token", accountId: "test-account" }),
          save: async () => {
            throw new Error("本测试不应刷新 token");
          },
        },
      }),
      model = createOpenAI({
        apiKey: fields.apiKey,
        baseURL: fields.configuration.baseURL,
        fetch: fields.configuration.fetch,
      }).responses("test-model"),
      result = await model.doStream({
        headers: {
          "session-id": "session-a",
          "thread-id": "session-a",
          "x-client-request-id": "session-a",
          "x-codex-window-id": "window-a",
        },
        prompt: [{ content: [{ text: "test", type: "text" }], role: "user" }],
      });
    await result.stream.pipeTo(new WritableStream());
    const headers = received[0]!;
    expect(received).toHaveLength(1);
    expect(headers.get("authorization")).toBe("Bearer test-token");
    expect(headers.get("chatgpt-account-id")).toBe("test-account");
    expect(headers.get("originator")).toBe("codex_cli_rs");
    expect(headers.get("version")).toBe(codexProtocol.version);
    expect(headers.get("user-agent")).toStartWith(`codex_cli_rs/${codexProtocol.version} (`);
    expect(headers.get("accept")).toBe("text/event-stream");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("content-encoding")).toBe("zstd");
    expect(headers.get("session-id")).toBe("session-a");
    expect(headers.get("thread-id")).toBe("session-a");
    expect(headers.get("x-client-request-id")).toBe("session-a");
    expect(headers.get("x-codex-window-id")).toBe("window-a");
    expect([...headers.keys()].toSorted()).toEqual(
      [
        "accept",
        "authorization",
        "chatgpt-account-id",
        "connection",
        "content-encoding",
        "content-length",
        "content-type",
        "host",
        "originator",
        "session-id",
        "thread-id",
        "user-agent",
        "version",
        "x-client-request-id",
        "x-codex-window-id",
      ].toSorted(),
    );
  } finally {
    await runtime.close();
    await server.stop(true);
  }
});
