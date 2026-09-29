import { Client, type Transport } from "@modelcontextprotocol/client";
import { cleanupFailedInitialization } from "../lifecycle";

export type McpOperations = Pick<Client, "callTool" | "listTools" | "readResource">;
export async function connectProtocolClient(
  transport: Transport,
  options: { signal?: AbortSignal; onclose?: () => void } = {},
) {
  const client = new Client(
    { name: "omity-agent", version: "1.0.0" },
    { versionNegotiation: { mode: "auto" } },
  );
  // oxlint-disable-next-line unicorn/prefer-add-event-listener -- MCP Client 不是 EventTarget。
  client.onclose = options.onclose;
  try {
    await client.connect(transport, { signal: options.signal });
    disableClientRequestTimeout(client);
    return client;
  } catch (error) {
    return cleanupFailedInitialization(error, () => client.close());
  }
}
const setupTimeoutMethod = "_setupTimeout";
function skipRequestTimeout() {
  return undefined;
}
function disableClientRequestTimeout(client: Client) {
  const setupTimeout: unknown = Reflect.get(client, setupTimeoutMethod);
  if (setupTimeout === skipRequestTimeout) {
    return;
  }
  if (typeof setupTimeout !== "function") {
    throw new Error("当前 MCP client SDK 不支持关闭请求超时");
  }
  Object.defineProperty(client, setupTimeoutMethod, {
    configurable: true,
    value: skipRequestTimeout,
    writable: true,
  });
}
