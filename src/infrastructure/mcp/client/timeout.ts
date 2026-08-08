import { Protocol } from "@modelcontextprotocol/sdk/shared/protocol.js";

const setupTimeoutMethod = "_setupTimeout";
function skipRequestTimeout() {
  return undefined;
}
export function disableAdapterRequestTimeout() {
  disableRequestTimeout(Protocol.prototype, "MCP adapter SDK");
}
export function disableClientRequestTimeout(client: object) {
  disableRequestTimeout(client, "MCP client SDK");
}
function disableRequestTimeout(target: object, sdkName: string) {
  const setupTimeout: unknown = Reflect.get(target, setupTimeoutMethod);
  if (setupTimeout === skipRequestTimeout) {
    return;
  }
  if (typeof setupTimeout !== "function") {
    throw new Error(`当前 ${sdkName} 不支持关闭请求超时`);
  }
  Object.defineProperty(target, setupTimeoutMethod, {
    configurable: true,
    value: skipRequestTimeout,
    writable: true,
  });
}
