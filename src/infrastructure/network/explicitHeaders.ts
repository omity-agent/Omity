import type { Dispatcher } from "undici/index.js";
import { isPlainObject } from "es-toolkit";

export type HeaderPolicy = "explicit";
export type OutboundFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
  policy?: HeaderPolicy,
) => Promise<Response>;

const registeredFetches = new WeakMap<object, OutboundFetch>();
export function registerExplicitFetch(fetch: OutboundFetch) {
  registeredFetches.set(fetch, fetch);
}
export const fetchWithExplicitHeaders: OutboundFetch = (input, init) => {
  const fetch = registeredFetches.get(globalThis.fetch);
  if (!fetch) {
    throw new Error("Codex 请求需要先安装统一出站网络层");
  }
  return fetch(input, init, "explicit");
};
export function explicitHeaderDispatcher(dispatcher: Dispatcher, headers: Headers) {
  const names = new Set(headers.keys());
  return dispatcher.compose((dispatch) => (options, handler) => {
    // Undici Fetch 在 dispatch 前补齐浏览器默认头；仅保留调用者提供的头和正文长度。
    // 读取 Fetch 传入的 header record，保留重定向时已经移除的认证头。
    const input = options.headers;
    if (!isPlainObject(input) || Object.values(input).some((value) => typeof value !== "string")) {
      throw new TypeError("Undici Fetch 请求头格式发生变化");
    }
    const filtered = Object.fromEntries(
      Object.entries(input).filter(
        ([name]) => names.has(name.toLowerCase()) || name.toLowerCase() === "content-length",
      ),
    );
    return dispatch({ ...options, headers: filtered }, handler);
  });
}
