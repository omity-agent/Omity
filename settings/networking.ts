export const requestBodyLimit = 1024 * 1024;
export const requestListenerOptions = { overrideGlobalObjects: false };
export const outboundAgentOptions = {
  bodyTimeout: 0,
  headersTimeout: 0,
};
export const websocketHandshakeHeaders = [
  "connection",
  "sec-websocket-extensions",
  "sec-websocket-key",
  "sec-websocket-protocol",
  "sec-websocket-version",
  "upgrade",
];
export const mcpHttpReconnection = {
  initialReconnectionDelay: 0,
  maxReconnectionDelay: 0,
  maxRetries: 0,
  reconnectionDelayGrowFactor: 1,
};
