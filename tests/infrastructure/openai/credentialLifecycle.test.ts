import { expect, test } from "bun:test";

import { DEFAULT_OPENAI_OAUTH_CLIENT_ID } from "@openai-oauth/core";
import { openaiCredentials } from "@openai-oauth/local";
import { z } from "zod";

import { fetchWithExplicitHeaders } from "../../../src/infrastructure/network/explicitHeaders";
import { createNetworkRuntime } from "../../../src/infrastructure/network/installNetworking";
import { createCodexConnection } from "../../../src/infrastructure/openai/oauthConnection";
import { createOAuthFile, createTestJwt } from "./authSessionFixture";

test.each([
  { reason: "expired token", refreshAgeMs: 0, remainingMs: -1000 },
  { reason: "near-expiry token", refreshAgeMs: 0, remainingMs: 60_000 },
  { reason: "refresh interval", refreshAgeMs: 3_600_000, remainingMs: 3_600_000 },
])(
  "$reason refreshes once for concurrent handshakes and persists rotated tokens",
  async ({ remainingMs, refreshAgeMs }) => {
    using auth = await createOAuthFile({
      accessToken: createTestJwt({ exp: Math.floor((Date.now() + remainingMs) / 1000) }),
      lastRefresh: new Date(Date.now() - refreshAgeMs).toISOString(),
      refreshToken: "initial-refresh",
    });
    let requests = 0;
    const freshToken = createTestJwt({
        exp: Math.floor(Date.now() / 1000) + 3600,
        "https://api.openai.com/auth": { chatgpt_account_id: "refreshed-account" },
      }),
      server = Bun.serve({
        async fetch(request) {
          requests += 1;
          expect(request.method).toBe("POST");
          expect(request.headers.get("user-agent")).toBeNull();
          expect(request.headers.get("sec-fetch-mode")).toBeNull();
          expect(await request.json()).toEqual({
            client_id: DEFAULT_OPENAI_OAUTH_CLIENT_ID,
            grant_type: "refresh_token",
            refresh_token: "initial-refresh",
          });
          await Bun.sleep(20);
          return Response.json({
            access_token: freshToken,
            refresh_token: "rotated-refresh",
            token_type: "Bearer",
          });
        },
        hostname: "127.0.0.1",
        port: 0,
      }),
      runtime = createNetworkRuntime(async () => undefined),
      previousFetch = globalThis.fetch,
      connection = createCodexConnection({
        codexVersion: "0.154.4",
        credentials: openaiCredentials({
          authFilePath: auth.path,
          fetch: fetchWithExplicitHeaders,
          tokenUrl: new URL("/token", server.url).href,
        }),
      });
    globalThis.fetch = runtime.fetch;
    try {
      const sessions = await Promise.all(Array.from({ length: 8 }, () => connection.websocket()));
      expect(requests).toBe(1);
      for (const session of sessions) {
        expect(session.apiKey).toBe(freshToken);
        expect(session.headers["ChatGPT-Account-Id"]).toBe("refreshed-account");
      }
      const saved = z
        .object({
          auth_mode: z.literal("chatgpt"),
          last_refresh: z.iso.datetime(),
          tokens: z.object({
            access_token: z.string(),
            account_id: z.string(),
            refresh_token: z.string(),
          }),
        })
        .parse(await Bun.file(auth.path).json());
      expect(saved.tokens).toMatchObject({
        access_token: freshToken,
        account_id: "refreshed-account",
        refresh_token: "rotated-refresh",
      });
      expect(Date.parse(saved.last_refresh)).toBeGreaterThan(Date.now() - 5000);
      const reloaded = await connection.websocket();
      expect(reloaded.apiKey).toBe(freshToken);
      expect(requests).toBe(1);
      await Bun.write(
        auth.path,
        JSON.stringify({
          ...saved,
          tokens: { ...saved.tokens, account_id: "switched-account" },
        }),
      );
      const switched = await connection.websocket();
      expect(switched.headers["ChatGPT-Account-Id"]).toBe("switched-account");
      expect(requests).toBe(1);
    } finally {
      globalThis.fetch = previousFetch;
      await runtime.close();
      await server.stop(true);
    }
  },
);
test("refresh failures propagate without overwriting credentials and permit another attempt", async () => {
  using auth = await createOAuthFile({
    accessToken: createTestJwt({ exp: Math.floor(Date.now() / 1000) + 60 }),
    refreshToken: "initial-refresh",
  });
  let requests = 0;
  const original = await Bun.file(auth.path).text(),
    freshToken = createTestJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }),
    server = Bun.serve({
      fetch() {
        requests += 1;
        return requests === 1
          ? Response.json({ error: "invalid_grant" }, { status: 403 })
          : Response.json({ access_token: freshToken, refresh_token: "rotated-refresh" });
      },
      hostname: "127.0.0.1",
      port: 0,
    }),
    runtime = createNetworkRuntime(async () => undefined),
    previousFetch = globalThis.fetch,
    connection = createCodexConnection({
      codexVersion: "0.154.4",
      credentials: openaiCredentials({
        authFilePath: auth.path,
        fetch: fetchWithExplicitHeaders,
        tokenUrl: new URL("/token", server.url).href,
      }),
    });
  globalThis.fetch = runtime.fetch;
  try {
    expect(Promise.all(Array.from({ length: 8 }, () => connection.websocket()))).rejects.toThrow(
      "HTTP 403",
    );
    expect(requests).toBe(1);
    expect(await Bun.file(auth.path).text()).toBe(original);
    const retried = await connection.websocket();
    expect(retried.apiKey).toBe(freshToken);
    expect(requests).toBe(2);
  } finally {
    globalThis.fetch = previousFetch;
    await runtime.close();
    await server.stop(true);
  }
});
test("local credentials honor CODEX_HOME and derive account and FedRamp claims", async () => {
  using auth = await createOAuthFile({
    accountId: null,
    idToken: createTestJwt({
      "https://api.openai.com/auth": {
        chatgpt_account_id: "derived-account",
        chatgpt_account_is_fedramp: true,
      },
    }),
  });
  const previousHome = process.env["CODEX_HOME"];
  process.env["CODEX_HOME"] = auth.directory;
  try {
    const connection = createCodexConnection({ codexVersion: "0.154.4" }),
      session = await connection.websocket();
    expect(session.apiKey).toBe("codex-test-token");
    expect(session.headers["ChatGPT-Account-Id"]).toBe("derived-account");
    expect(session.headers["X-OpenAI-Fedramp"]).toBe("true");
  } finally {
    if (previousHome === undefined) {
      Reflect.deleteProperty(process.env, "CODEX_HOME");
    } else {
      process.env["CODEX_HOME"] = previousHome;
    }
  }
});
