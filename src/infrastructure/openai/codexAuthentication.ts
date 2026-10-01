import { type CloudflareCookieStore, sharedCloudflareStore } from "./cloudflareStore";
import {
  DEFAULT_CODEX_BASE_URL,
  type OpenAIOAuthTokens,
  type TokenStore,
  deriveAccountId,
  deriveExpiresAt,
  refreshOpenAITokens,
} from "openai-codex-oauth";
import type { OutboundFetch } from "../network/explicitHeaders";
import { codexDefaultHeaders } from "./clientIdentity";
import { codexProtocol } from "../../../settings/openai/codexProtocol";
import { createCodexAuthFileStore } from "openai-codex-oauth/node";
import { createCodexTransport } from "./wireTransport";
import { createCodexVersionResolver } from "./codexVersion";
import { homedir } from "node:os";
import { join } from "node:path";

interface CodexClientOptions {
  authFilePath?: string;
  cookieStore?: CloudflareCookieStore;
  codexVersion?: string;
  fetch?: OutboundFetch;
  tokenStore?: TokenStore;
}
export function createCodexClientFields(options: CodexClientOptions = {}) {
  const authFilePath = options.authFilePath ?? join(homedir(), ".codex", "auth.json"),
    tokenStore = options.tokenStore ?? createCodexAuthFileStore({ authFilePath }),
    cookieStore = options.cookieStore ?? sharedCloudflareStore,
    resolveVersion = createCodexVersionResolver(options.codexVersion),
    transport = Object.assign(createCodexTransport(options.fetch, cookieStore, resolveVersion), {
      preconnect() {
        throw new Error("Codex 不支持绕过统一代理的 preconnect");
      },
    }),
    websocketTokens = new CodexWebsocketTokens(tokenStore, transport);
  return {
    apiKey: "codex-oauth",
    configuration: {
      baseURL: DEFAULT_CODEX_BASE_URL,
      maxRetries: 0,
    },
    websocket: async () => {
      const [tokens, version] = await Promise.all([websocketTokens.get(), resolveVersion()]),
        accountId = tokens.accountId ?? deriveAccountId(tokens.idToken, tokens.accessToken),
        url = `${DEFAULT_CODEX_BASE_URL}/responses`,
        cookies = cookieStore.cookies(url);
      if (!accountId) {
        throw new Error("Codex OAuth 缺少 ChatGPT Account ID");
      }
      return {
        apiKey: tokens.accessToken,
        headers: {
          ...Object.fromEntries(codexDefaultHeaders(version)),
          "ChatGPT-Account-Id": accountId,
          "OpenAI-Beta": codexProtocol.websocketBeta,
          ...(cookies ? { cookie: cookies } : {}),
        },
        onHandshake(headers: Headers) {
          cookieStore.store(url, headers.getSetCookie());
        },
        stream: true,
      };
    },
  };
}
class CodexWebsocketTokens {
  private pending?: Promise<OpenAIOAuthTokens>;
  constructor(
    private readonly store: TokenStore,
    private readonly fetch: typeof globalThis.fetch,
  ) {}
  async get() {
    if (this.pending) {
      return await this.pending;
    }
    const pending = this.load();
    this.pending = pending;
    try {
      return await pending;
    } finally {
      if (this.pending === pending) {
        this.pending = undefined;
      }
    }
  }
  private async load() {
    let tokens = await this.store.load();
    if (!tokens?.accessToken) {
      throw new Error("Codex OAuth 缺少 access token");
    }
    const now = Date.now(),
      expiresAt = tokens.expiresAt ?? deriveExpiresAt(tokens.accessToken);
    if (expiresAt !== undefined && expiresAt <= now + 300_000) {
      const refreshed = await refreshOpenAITokens({ fetch: this.fetch, tokens });
      if (refreshed) {
        tokens = refreshed;
        await this.store.save(tokens);
      } else if (expiresAt <= now) {
        throw new Error("Codex OAuth access token 已过期且刷新失败");
      }
    }
    return tokens;
  }
}
