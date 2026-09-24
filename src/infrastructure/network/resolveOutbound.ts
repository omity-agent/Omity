import { type ProxyConfig, ProxyResolver } from "@vscode/os-proxy-resolver";

type NativeResolver = Pick<
  ProxyResolver,
  "resolve" | "readProxyConfig" | "configGeneration" | "close"
>;
const environmentNames = ["http_proxy", "https_proxy", "all_proxy", "no_proxy"];
export class OutboundRouting {
  private current?: {
    environment: string;
    resolver: NativeResolver;
    inspection?: { generation: number; result: Promise<void> };
  };
  constructor(private readonly createResolver: () => NativeResolver = () => new ProxyResolver()) {}
  async resolve(target: string): Promise<string | undefined> {
    const url = new URL(target),
      environmentProxy =
        readEnvironment(`${url.protocol.slice(0, -1)}_proxy`) || readEnvironment("all_proxy"),
      configuredProxy = environmentProxy ? normalizeProxy(environmentProxy) : undefined,
      state = this.state();
    if (!configuredProxy) {
      const generation = state.resolver.configGeneration;
      if (state.inspection?.generation !== generation) {
        state.inspection = {
          generation,
          result: inspectConfiguration(state.resolver),
        };
      }
      await state.inspection.result;
    }
    const [selected] = await state.resolver.resolve(url.href);
    if (!selected) {
      throw new Error("系统代理解析未返回连接方式");
    }
    if (selected.kind === "direct") {
      return undefined;
    }
    if (configuredProxy) {
      return configuredProxy;
    }
    if (!selected.host) {
      throw new Error("系统代理解析未返回代理地址");
    }
    return normalizeProxy(selected.kind === "socks" ? `socks5://${selected.host}` : selected.host);
  }
  close() {
    this.current?.resolver.close();
    this.current = undefined;
  }
  private state() {
    const environment = JSON.stringify(environmentNames.map(readEnvironment));
    if (!this.current || this.current.environment !== environment) {
      this.close();
      this.current = { environment, resolver: this.createResolver() };
    }
    return this.current;
  }
}
function readEnvironment(name: string) {
  return process.env[name] || process.env[name.toUpperCase()] || "";
}
function normalizeProxy(value: string) {
  let url: URL;
  try {
    url = new URL(value.includes("://") ? value : `http://${value}`);
  } catch {
    throw new Error("代理地址无效，请检查系统设置或代理环境变量");
  }
  if (!["http:", "https:", "socks:", "socks5:"].includes(url.protocol)) {
    throw new Error(`不支持的代理协议：${url.protocol}`);
  }
  if (!url.hostname || (url.pathname !== "" && url.pathname !== "/") || url.search || url.hash) {
    throw new Error("代理地址应只包含协议、认证信息、主机与端口");
  }
  return url.href;
}
async function inspectConfiguration(resolver: NativeResolver) {
  const config: ProxyConfig = await resolver.readProxyConfig();
  for (const source of ["wpadDhcp", "wpadDns", "configuredPac"] as const) {
    const status = config[source];
    if (status.state === "error-discovery" || status.state === "error-download") {
      throw new Error(`系统代理配置解析失败：${source}`, {
        cause: new Error(status.error ?? status.state),
      });
    }
  }
  for (const value of Object.values(config.environment)) {
    if (value?.error) {
      throw new Error(`代理环境变量无效：${value.variable}`);
    }
  }
}
