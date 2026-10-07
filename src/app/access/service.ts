import {
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { type ClientIdentity, ClientNetwork } from "./network";
import { RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible";
import { AccessStore } from "./store";
import { HttpError } from "../http/errors";
import { type IncomingMessage } from "node:http";
import { type Settings } from "../../types";
import { WebAuthnCeremony } from "./ceremony";
import { localize } from "../../i18n/server";

export const accessSessionCookie = "__Host-omity_access";
export const accessChallengeCookie = "__Host-omity_challenge";
interface AccessStatus {
  authenticated: boolean;
  configured: boolean;
  credentialCount: number;
  local: boolean;
  publicOrigin: string | null;
}
export class AccessService {
  private readonly network: ClientNetwork;
  private readonly store: AccessStore;
  private readonly limiter: RateLimiterMemory;
  private readonly ceremony: WebAuthnCeremony;
  constructor(private readonly settings: Settings) {
    this.network = new ClientNetwork(settings.access.trustedProxies);
    this.store = new AccessStore();
    this.ceremony = new WebAuthnCeremony(settings, this.store);
    this.limiter = new RateLimiterMemory({
      blockDuration: Math.ceil(settings.access.loginRateLimit.windowMs / 1000),
      duration: Math.ceil(settings.access.loginRateLimit.windowMs / 1000),
      points: settings.access.loginRateLimit.attempts,
    });
  }
  get sessionTtlMs() {
    return this.settings.access.sessionTtlMs;
  }
  get challengeTtlMs() {
    return this.settings.access.challengeTtlMs;
  }
  close() {
    this.store.close();
  }
  identify(request: IncomingMessage) {
    try {
      return this.network.identify(request);
    } catch (error) {
      throw new HttpError(
        400,
        error instanceof Error ? error.message : localize("access:service.clientAddressUnknown"),
        "BAD_REQUEST",
      );
    }
  }
  status(identity: ClientIdentity, token?: string): AccessStatus {
    return {
      authenticated: identity.local || this.store.hasSession(token),
      configured: this.settings.access.publicOrigin !== null,
      credentialCount: identity.local ? this.store.credentialCount() : 0,
      local: identity.local,
      publicOrigin: identity.local ? this.settings.access.publicOrigin : null,
    };
  }
  requireAccess(identity: ClientIdentity, token?: string) {
    if (!identity.local && !this.store.hasSession(token)) {
      throw new HttpError(401, localize("access:service.authenticationRequired"), "AUTH_REQUIRED");
    }
  }
  requireTrustedOrigin(
    identity: ClientIdentity,
    origin: string | undefined,
    requestOrigin: string,
  ) {
    if (!origin) {
      if (identity.local) {
        return;
      }
      throw new HttpError(403, localize("access:service.originMissing"), "LOCAL_ONLY");
    }
    if (
      origin === this.settings.access.publicOrigin ||
      (identity.local && origin === requestOrigin)
    ) {
      return;
    }
    throw new HttpError(
      403,
      localize("access:service.originRejected", { value0: origin }),
      "LOCAL_ONLY",
    );
  }
  registrationTicket(identity: ClientIdentity) {
    this.requireLocal(identity);
    this.ceremony.relyingParty();
    const ticket = this.store.createRegistrationTicket(this.settings.access.challengeTtlMs);
    return { ticket };
  }
  async registrationOptions(identity: ClientIdentity, ticket?: string) {
    if (!identity.local) {
      if (!ticket) {
        throw new HttpError(
          403,
          localize("access:service.registrationTicketMissing"),
          "LOCAL_ONLY",
        );
      }
      try {
        this.store.consumeRegistrationTicket(ticket);
      } catch {
        throw new HttpError(
          403,
          localize("access:service.registrationTicketInvalid"),
          "LOCAL_ONLY",
        );
      }
    }
    return this.ceremony.registrationOptions();
  }
  async register(challengeId: string, response: RegistrationResponseJSON) {
    return this.ceremony.register(challengeId, response);
  }
  async authenticationOptions(identity: ClientIdentity) {
    this.requirePublic(identity);
    await this.consumeRateLimit(identity, "options");
    return this.ceremony.authenticationOptions();
  }
  async authenticate(
    identity: ClientIdentity,
    challengeId: string,
    response: AuthenticationResponseJSON,
  ) {
    this.requirePublic(identity);
    await this.consumeRateLimit(identity, "verification");
    return this.ceremony.authenticate(challengeId, response);
  }
  logout(token?: string) {
    this.store.deleteSession(token);
  }
  private requireLocal(identity: ClientIdentity) {
    if (!identity.local) {
      throw new HttpError(403, localize("access:service.localRegistrationRequired"), "LOCAL_ONLY");
    }
  }
  private requirePublic(identity: ClientIdentity) {
    if (identity.local) {
      throw new HttpError(400, localize("access:service.localLoginNotRequired"), "BAD_REQUEST");
    }
  }
  private async consumeRateLimit(identity: ClientIdentity, phase: string) {
    try {
      await this.limiter.consume(`${phase}:${identity.address}`);
    } catch (error) {
      if (!(error instanceof RateLimiterRes)) {
        throw error;
      }
      throw new HttpError(429, localize("access:service.rateLimited"), "RATE_LIMITED");
    }
  }
}
