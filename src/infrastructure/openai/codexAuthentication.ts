import { DEFAULT_CODEX_BASE_URL, type TokenStore, createCodexOAuthFetch } from "openai-codex-oauth";
import type { CloudflareCookieStore } from "./cloudflareStore";
import type { OutboundFetch } from "../network/explicitHeaders";
import { createCodexAuthFileStore } from "openai-codex-oauth/node";
import { createCodexTransport } from "./wireTransport";
import { homedir } from "node:os";
import { join } from "node:path";

interface CodexClientOptions {
  authFilePath?: string;
  cookieStore?: CloudflareCookieStore;
  fetch?: OutboundFetch;
  tokenStore?: TokenStore;
}
export function createCodexClientFields(options: CodexClientOptions = {}) {
  const authFilePath = options.authFilePath ?? join(homedir(), ".codex", "auth.json"),
    transport = createCodexTransport(options.fetch, options.cookieStore);
  return {
    apiKey: "codex-oauth",
    configuration: {
      baseURL: DEFAULT_CODEX_BASE_URL,
      fetch: createCodexOAuthFetch({
        fetch: Object.assign(transport, {
          preconnect() {
            throw new Error("Codex 不支持绕过统一代理的 preconnect");
          },
        }),
        originator: false,
        tokenStore: options.tokenStore ?? createCodexAuthFileStore({ authFilePath }),
      }),
      maxRetries: 0,
    },
  };
}
