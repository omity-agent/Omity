import type { IncomingHttpHeaders } from "node:http";
import ipaddr from "ipaddr.js";
import { localize } from "../../i18n/server";

type Address = ReturnType<typeof ipaddr.process>;
type Cidr = ReturnType<typeof ipaddr.parseCIDR>;
export interface ClientIdentity {
  address: string;
  local: boolean;
}
interface PeerRequest {
  headers: IncomingHttpHeaders;
  socket: { remoteAddress?: string };
}
export class ClientNetwork {
  private readonly trustedProxies: Cidr[];
  constructor(trustedProxies: string[]) {
    this.trustedProxies = trustedProxies.map((cidr) => ipaddr.parseCIDR(cidr));
  }
  identify(request: PeerRequest): ClientIdentity {
    const remote = parseAddress(request.socket.remoteAddress),
      address = this.forwardedAddress(request, remote);
    return { address: address.toString(), local: isLocal(address) };
  }
  private forwardedAddress(request: PeerRequest, remote: Address) {
    const forwarded = request.headers["x-forwarded-for"];
    if (forwarded === undefined && remote.range() === "loopback") {
      return remote;
    }
    if (!this.matchesTrustedProxy(remote)) {
      if (forwarded !== undefined) {
        throw new Error(localize("access:network.untrustedForwardedFor"));
      }
      return remote;
    }
    if (forwarded === undefined) {
      throw new Error(localize("access:network.forwardedForMissing"));
    }
    if (Array.isArray(forwarded)) {
      throw new Error(localize("access:network.forwardedForDuplicate"));
    }
    const chain = forwarded.split(",").map((value) => parseAddress(value.trim()));
    if (chain.length === 0) {
      throw new Error(localize("access:network.forwardedForEmpty"));
    }
    let current = remote;
    for (
      let index = chain.length - 1;
      index >= 0 && this.matchesTrustedProxy(current);
      index -= 1
    ) {
      const next = chain[index];
      if (!next) {
        throw new Error(localize("access:network.forwardedForInvalid"));
      }
      current = next;
    }
    if (this.matchesTrustedProxy(current)) {
      throw new Error(localize("access:network.clientAddressMissingFromChain"));
    }
    return current;
  }
  private matchesTrustedProxy(address: Address) {
    return this.trustedProxies.some(([network, prefix]) => {
      const normalized = normalizePair(address, network);
      return normalized ? normalized[0].match(normalized[1], prefix) : false;
    });
  }
}
function parseAddress(value?: string) {
  if (!value || !ipaddr.isValid(value)) {
    throw new Error(
      localize("access:network.clientAddressInvalid", {
        value0: value ?? localize("errors:generic.missing"),
      }),
    );
  }
  return ipaddr.process(value);
}
function normalizePair(address: Address, network: Cidr[0]): [Address, Address] | undefined {
  if (address.kind() === network.kind()) {
    return [address, network];
  }
  return undefined;
}
function isLocalAddress(address: Address) {
  const range = address.range();
  return (
    range === "loopback" || range === "linkLocal" || range === "private" || range === "uniqueLocal"
  );
}
function isLocal(address: Address) {
  return isLocalAddress(address);
}
