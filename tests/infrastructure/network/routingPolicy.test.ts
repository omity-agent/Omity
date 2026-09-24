import { afterEach, expect, test } from "bun:test";
import { OutboundRouting } from "../../../src/infrastructure/network/resolveOutbound";
import type { ProxyConfig } from "@vscode/os-proxy-resolver";

const names = [
    "http_proxy",
    "HTTP_PROXY",
    "https_proxy",
    "HTTPS_PROXY",
    "all_proxy",
    "ALL_PROXY",
    "no_proxy",
    "NO_PROXY",
  ],
  original = new Map(names.map((name) => [name, process.env[name]]));
afterEach(() => {
  for (const [name, value] of original) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});
function resetEnvironment() {
  for (const name of names) {
    delete process.env[name];
  }
}
test("environment proxies preserve credentials and update without restarting", async () => {
  resetEnvironment();
  process.env["HTTPS_PROXY"] = "http://user:p%40ss@127.0.0.1:9101";
  const routing = new OutboundRouting();
  try {
    expect(await routing.resolve("https://example.com")).toBe("http://user:p%40ss@127.0.0.1:9101/");
    process.env["HTTPS_PROXY"] = "http://127.0.0.1:9102";
    expect(await routing.resolve("https://example.com")).toBe("http://127.0.0.1:9102/");
    process.env["NO_PROXY"] = "example.com";
    expect(await routing.resolve("https://example.com")).toBeUndefined();
  } finally {
    routing.close();
  }
});
test("HTTP and HTTPS select their own proxy before ALL_PROXY", async () => {
  resetEnvironment();
  process.env["HTTP_PROXY"] = "http://127.0.0.1:9201";
  process.env["ALL_PROXY"] = "socks5://127.0.0.1:9202";
  const routing = new OutboundRouting();
  try {
    expect(await routing.resolve("http://example.com")).toBe("http://127.0.0.1:9201/");
    expect(await routing.resolve("https://example.com")).toBe("socks5://127.0.0.1:9202");
  } finally {
    routing.close();
  }
});
test("malformed and unsupported proxy variables fail instead of connecting directly", async () => {
  resetEnvironment();
  const routing = new OutboundRouting();
  try {
    process.env["HTTPS_PROXY"] = "not a proxy";
    expect(routing.resolve("https://example.com")).rejects.toThrow("代理");
    process.env["HTTPS_PROXY"] = "ftp://127.0.0.1:21";
    expect(routing.resolve("https://example.com")).rejects.toThrow("代理");
  } finally {
    routing.close();
  }
});
test("system decisions and bypasses are used when no environment proxy is configured", async () => {
  resetEnvironment();
  let generation = 0,
    inspections = 0;
  const routing = new OutboundRouting(() => ({
    close() {},
    get configGeneration() {
      return generation;
    },
    async readProxyConfig() {
      inspections += 1;
      return emptyConfiguration();
    },
    async resolve(url) {
      return new URL(url).hostname === "internal.example"
        ? [{ kind: "direct" }]
        : [{ host: `127.0.0.1:${(9300 + generation).toString()}`, kind: "http" }];
    },
  }));
  try {
    expect(await routing.resolve("https://public.example")).toBe("http://127.0.0.1:9300/");
    expect(await routing.resolve("https://internal.example")).toBeUndefined();
    expect(inspections).toBe(1);
    generation += 1;
    expect(await routing.resolve("https://public.example")).toBe("http://127.0.0.1:9301/");
    expect(inspections).toBe(2);
  } finally {
    routing.close();
  }
});
test("PAC configuration failures surface as errors", async () => {
  resetEnvironment();
  const routing = new OutboundRouting(() => ({
    close() {},
    configGeneration: 0,
    async readProxyConfig() {
      return {
        ...emptyConfiguration(),
        configuredPac: { error: "PAC unavailable", state: "error-download" },
      };
    },
    async resolve() {
      return [{ kind: "direct" }];
    },
  }));
  try {
    expect(routing.resolve("https://public.example")).rejects.toThrow("系统代理配置解析失败");
  } finally {
    routing.close();
  }
});
function emptyConfiguration(): ProxyConfig {
  return {
    autoDetect: false,
    configuredPac: { state: "unconfigured" },
    environment: {},
    wpadDhcp: { state: "disabled" },
    wpadDns: { state: "disabled" },
  };
}
