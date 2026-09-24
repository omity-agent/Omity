import { expect, test } from "bun:test";
import { CloudflareCookieStore } from "../../../src/infrastructure/openai/cloudflareStore";
import { createCodexTransport } from "../../../src/infrastructure/openai/wireTransport";

const endpoint = "https://chatgpt.com/backend-api/codex/responses";
test("Codex shares only infrastructure cookies and respects domain, path and expiration", () => {
  const store = new CloudflareCookieStore();
  store.store(endpoint, [
    "__cf_bm=bot; Path=/; Secure; HttpOnly",
    "__oailb=route; Path=/backend-api; Max-Age=3600; Secure",
    "_cfuvid=visitor; Domain=chatgpt.com; Path=/; Secure",
    "cf_chl_rc_i=challenge; Path=/; Secure",
    "__Secure-next-auth.session-token=secret; Path=/; Secure",
    "chatgpt_session=account; Path=/; Secure",
  ]);
  expect(new Set(store.cookies(endpoint).split("; "))).toEqual(
    new Set(["__cf_bm=bot", "__oailb=route", "_cfuvid=visitor", "cf_chl_rc_i=challenge"]),
  );
  expect(store.cookies("https://chatgpt.com/")).not.toContain("__oailb");
  expect(store.cookies("https://other.chatgpt.com/backend-api")).toBe("_cfuvid=visitor");
  expect(store.cookies("https://chatgpt.com/backend-api-other")).not.toContain("__oailb");
  store.store(endpoint, ["__oailb=; Path=/backend-api; Max-Age=0; Secure"]);
  expect(store.cookies(endpoint)).not.toContain("__oailb");
  store.store(endpoint, ["__cf_bm=updated; Path=/; Secure"]);
  expect(store.cookies(endpoint)).toContain("__cf_bm=updated");
  expect(store.cookies(endpoint)).not.toContain("__cf_bm=bot");
});

test("Codex refuses cookies outside the upstream HTTPS ChatGPT host allowlist", () => {
  const store = new CloudflareCookieStore();
  for (const host of [
    "chatgpt.com",
    "a.chatgpt.com",
    "chat.openai.com",
    "chatgpt-staging.com",
    "a.chatgpt-staging.com",
  ]) {
    const url = `https://${host}/`;
    store.store(url, ["__cflb=allowed; Path=/; Secure"]);
    expect(store.cookies(url)).toContain("__cflb=allowed");
  }
  for (const url of [
    "http://chatgpt.com/",
    "https://api.openai.com/",
    "https://evilchatgpt.com/",
    "https://chatgpt.com.evil.example/",
    "https://foo.chat.openai.com/",
  ]) {
    store.store(url, ["cf_clearance=rejected; Path=/"]);
    expect(store.cookies(url)).toBe("");
  }
  expect(store.cookies("https://chatgpt.com/")).not.toContain("cf_clearance");
});

test("Codex transport stores response cookies and replays them on the next request", async () => {
  const store = new CloudflareCookieStore(),
    requests: Headers[] = [],
    transport = createCodexTransport(async (_input, init) => {
      requests.push(new Headers(init?.headers));
      return new Response(null, {
        headers: [["set-cookie", "__oailb=route; Path=/backend-api; Secure"]],
      });
    }, store);
  await transport("https://chatgpt.com/backend-api/codex/responses", { method: "GET" });
  await transport("https://chatgpt.com/backend-api/codex/responses", { method: "GET" });
  expect(requests).toHaveLength(2);
  expect(requests[1]?.get("cookie")).toBe("__oailb=route");
});
