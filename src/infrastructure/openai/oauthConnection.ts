import {
  DEFAULT_CODEX_BASE_URL,
  type OpenAIOAuth,
  type OpenAIOAuthSession,
} from "@openai-oauth/core";
import { type LocalOpenAIOAuthOptions, openaiCredentials } from "@openai-oauth/local";

import { codexProtocol } from "../../../settings/openai/codexProtocol";
import { localize } from "../../i18n/server";
import { fetchWithExplicitHeaders } from "../network/explicitHeaders";
import { codexDefaultHeaders } from "./clientIdentity";
import { type CloudflareCookieStore, sharedCloudflareStore } from "./cloudflareStore";
import { createCodexVersionResolver } from "./codexVersion";

interface CodexConnectionOptions extends Pick<LocalOpenAIOAuthOptions, "authFilePath" | "fetch"> {
  cookieStore?: CloudflareCookieStore;
  codexVersion?: string;
  credentials?: OpenAIOAuth;
}
export function createCodexConnection(options: CodexConnectionOptions = {}) {
  const credentials =
      options.credentials ??
      openaiCredentials({
        authFilePath: options.authFilePath,
        fetch: options.fetch ?? fetchWithExplicitHeaders,
      }),
    cookieStore = options.cookieStore ?? sharedCloudflareStore,
    resolveVersion = createCodexVersionResolver(options.codexVersion);
  let pending: Promise<OpenAIOAuthSession | null> | undefined;
  return {
    apiKey: "codex-oauth",
    baseURL: DEFAULT_CODEX_BASE_URL,
    websocket: async () => {
      const [session, version] = await Promise.all([
          (pending ??= credentials.getSession().finally(() => {
            pending = undefined;
          })),
          resolveVersion(),
        ]),
        url = `${DEFAULT_CODEX_BASE_URL}/responses`,
        cookies = cookieStore.cookies(url);
      if (!session) {
        throw new Error(localize("network:codex.sessionMissing"));
      }
      return {
        apiKey: session.accessToken,
        headers: {
          ...Object.fromEntries(codexDefaultHeaders(version)),
          "ChatGPT-Account-Id": session.accountId,
          "OpenAI-Beta": codexProtocol.websocketBeta,
          ...(session.isFedRamp ? { "X-OpenAI-Fedramp": "true" } : {}),
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
