import { ClientNetwork, type PeerRequest } from "../../src/app/access/network";
import { expect, test } from "bun:test";
import { registrationBody } from "../../src/app/http/accessRequest";

test("untrusted clients cannot supply X-Forwarded-For", () => {
  const network = new ClientNetwork([]);
  expect(() => network.identify(request("203.0.113.9", "192.168.1.20"))).toThrow(
    "未受信任的对端不能发送 X-Forwarded-For",
  );
});
test("trusted proxy chains resolve from right to left", () => {
  const network = new ClientNetwork(["127.0.0.0/8", "10.0.0.0/8"]),
    identity = network.identify(request("127.0.0.1", "198.51.100.7, 10.1.2.3"));
  expect(identity).toEqual({ address: "198.51.100.7", local: false });
});
test("direct loopback clients do not need a forwarded address", () => {
  const network = new ClientNetwork(["127.0.0.0/8"]),
    identity = network.identify(request("127.0.0.1"));
  expect(identity).toEqual({ address: "127.0.0.1", local: true });
});
test("trusted proxies must supply a forwarded address", () => {
  const network = new ClientNetwork(["10.0.0.0/8"]);
  expect(() => network.identify(request("10.1.2.3"))).toThrow(
    "来自可信代理的请求缺少 X-Forwarded-For",
  );
});
test("trusted proxy chains must contain an external client address", () => {
  const network = new ClientNetwork(["127.0.0.0/8", "10.0.0.0/8"]);
  expect(() => network.identify(request("127.0.0.1", "10.1.2.3"))).toThrow(
    "X-Forwarded-For 未包含可信代理链之外的客户端地址",
  );
});
test.each<{ transports: string[] | undefined }>([
  { transports: undefined },
  { transports: [] },
  { transports: ["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"] },
  { transports: ["vendor-transport"] },
])("registration accepts optional transport strings: %j", ({ transports }) => {
  const result = registrationBody.parse(registrationResponse(transports));
  expect(result.response.transports).toEqual(transports);
});
test.each([
  { transports: null },
  { transports: "usb" },
  { transports: [42] },
  { transports: ["usb", null] },
  { transports: {} },
])("registration rejects invalid transport values: %j", ({ transports }) => {
  expect(registrationBody.safeParse(registrationResponse(transports)).success).toBe(false);
});
function registrationResponse(transports: unknown) {
  return {
    clientExtensionResults: {},
    id: "credential",
    rawId: "credential",
    response: {
      attestationObject: "attestation",
      clientDataJSON: "client-data",
      ...(transports === undefined ? {} : { transports }),
    },
    type: "public-key",
  };
}
function request(remoteAddress: string, forwarded?: string) {
  return {
    headers: forwarded ? { "x-forwarded-for": forwarded } : {},
    socket: { remoteAddress },
  } satisfies PeerRequest;
}
