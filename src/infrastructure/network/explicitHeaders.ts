import type { Dispatcher } from "undici/index.js";
import { isPlainObject } from "es-toolkit";
import { localize } from "../../i18n/server";

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
    throw new Error(localize("network:outbound.layerMissing"));
  }
  return fetch(input, init, "explicit");
};
export function explicitHeaderDispatcher(
  dispatcher: Dispatcher,
  headers: Headers,
  transportHeaders: readonly string[] = [],
) {
  const names = new Set([...headers.keys(), ...transportHeaders]);
  return dispatcher.compose((dispatch) => (options, handler) => {
    // Undici Fetch adds browser defaults before dispatch; keep caller headers and content length only.
    // Read the header record supplied to Fetch and preserve headers already removed during redirects.
    const input = options.headers;
    if (!isPlainObject(input) || Object.values(input).some((value) => typeof value !== "string")) {
      throw new TypeError(localize("network:outbound.headersFormatChanged"));
    }
    const filtered = Object.fromEntries(
      Object.entries(input).filter(
        ([name]) => names.has(name.toLowerCase()) || name.toLowerCase() === "content-length",
      ),
    );
    return dispatch({ ...options, headers: filtered }, handler);
  });
}
