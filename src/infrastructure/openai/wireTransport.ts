import { type CloudflareCookieStore, sharedCloudflareStore } from "./cloudflareStore";
import { type OutboundFetch, fetchWithExplicitHeaders } from "../network/explicitHeaders";
import { DEFAULT_CODEX_BASE_URL } from "openai-codex-oauth";
import { codexDefaultHeaders } from "./clientIdentity";
import { codexProtocol } from "../../../settings/openai/codexProtocol";

export function createCodexTransport(
  fetch: OutboundFetch = fetchWithExplicitHeaders,
  store: CloudflareCookieStore = sharedCloudflareStore,
) {
  let turn: { key: string; state?: string } | undefined;
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (!request.url.startsWith(`${DEFAULT_CODEX_BASE_URL}/`)) {
      return fetch(input, init);
    }
    const headers = codexDefaultHeaders();
    for (const name of codexProtocol.requestHeaders) {
      const value = request.headers.get(name);
      if (value !== null) {
        headers.set(name, value);
      }
    }
    headers.set("accept", "text/event-stream");
    headers.set("content-type", "application/json");
    let body: BodyInit | undefined;
    if (request.body !== null) {
      const rawBody = await request.text();
      body = new Uint8Array(Bun.zstdCompressSync(rawBody, { level: 3 }));
      headers.set("content-encoding", "zstd");
    }
    const key = request.headers.get("x-codex-turn-metadata");
    if (key && turn?.key !== key) {
      turn = { key };
    }
    const currentTurn = key ? turn : undefined;
    if (currentTurn?.state) {
      headers.set("x-codex-turn-state", currentTurn.state);
    }
    const response = await followCodexRequest(fetch, store, request.url, {
      body,
      headers,
      method: request.method,
      signal: request.signal,
    });
    const state = response.headers.get("x-codex-turn-state");
    if (currentTurn && state !== null) {
      currentTurn.state ??= state;
    }
    return response;
  };
}
async function followCodexRequest(
  fetch: OutboundFetch,
  store: CloudflareCookieStore,
  initialUrl: string,
  init: RequestInit & { headers: Headers },
) {
  let url = initialUrl;
  for (let redirects = 0; ; redirects += 1) {
    const headers = new Headers(init.headers);
    if (!headers.has("cookie")) {
      const cookies = store.cookies(url);
      if (cookies) {
        headers.set("cookie", cookies);
      }
    }
    const response = await fetch(url, { ...init, headers, redirect: "manual" }, "explicit");
    store.store(url, response.headers.getSetCookie());
    const location = response.headers.get("location");
    if (![301, 302, 303, 307, 308].includes(response.status) || location === null) {
      return response;
    }
    await response.body?.cancel();
    if (redirects >= codexProtocol.maxRedirects) {
      throw new Error("Codex 请求重定向次数超过上游限制");
    }
    const target = new URL(location, url),
      previous = new URL(url);
    if (target.protocol !== "https:" && target.protocol !== "http:") {
      throw new Error("Codex 请求重定向到了不支持的协议");
    }
    if (target.hostname !== previous.hostname || target.port !== previous.port) {
      for (const name of ["authorization", "cookie", "cookie2", "proxy-authorization"]) {
        init.headers.delete(name);
      }
    }
    if (response.status === 303 || response.status === 301 || response.status === 302) {
      if (init.method !== "GET" && init.method !== "HEAD") {
        init.method = "GET";
      }
      init.body = undefined;
      for (const name of [
        "content-type",
        "content-length",
        "content-encoding",
        "transfer-encoding",
      ]) {
        init.headers.delete(name);
      }
    }
    url = target.href;
  }
}
