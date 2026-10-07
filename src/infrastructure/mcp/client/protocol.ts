import { Client, type Transport } from "@modelcontextprotocol/client";
import { cleanupFailedInitialization } from "../lifecycle";
import { localize } from "../../../i18n/server";

export type McpOperations = Pick<
  Client,
  "callTool" | "getProtocolEra" | "listTools" | "readResource"
>;
export async function connectProtocolClient(
  transport: Transport,
  options: { signal?: AbortSignal; onclose?: () => void } = {},
) {
  const client = new Client(
    { name: "omity-agent", version: "1.0.0" },
    { versionNegotiation: { mode: "auto" } },
  );
  // oxlint-disable-next-line unicorn/prefer-add-event-listener -- The MCP Client is not an EventTarget.
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
    throw new Error(localize("network:mcp.requestTimeoutCloseUnsupported"));
  }
  Object.defineProperty(client, setupTimeoutMethod, {
    configurable: true,
    value: skipRequestTimeout,
    writable: true,
  });
}
