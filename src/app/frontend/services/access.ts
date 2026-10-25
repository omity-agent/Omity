import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";

import {
  accessStatusSchema,
  authenticatedSchema,
  loginOptionsSchema,
  registeredSchema,
  registrationOptionsSchema,
  ticketSchema,
} from "../../contracts/authentication";
import { localize } from "../i18n";
import { api, request } from "./httpTransport";

export type { AccessStatus } from "../../contracts/authentication";
export async function accessStatus() {
  return request(api.access.$get(), accessStatusSchema);
}
export async function login() {
  requireWebAuthn();
  const { options } = await request(api.access.login.options.$post(), loginOptionsSchema),
    response = await startAuthentication({ optionsJSON: options });
  return request(api.access.login.$post({ json: response }), authenticatedSchema);
}
export async function register(ticket?: string) {
  requireWebAuthn();
  const { options, origin } = await request(
    api.access.register.options.$post({ json: ticket ? { ticket } : {} }),
    registrationOptionsSchema,
  );
  if (origin !== globalThis.location.origin) {
    throw new Error(localize("frontend:access.setupOriginRequired", { value0: origin }));
  }
  const response = await startRegistration({ optionsJSON: options });
  return request(api.access.register.$post({ json: response }), registeredSchema);
}
export async function registrationTicket() {
  return request(api.access.register.ticket.$post(), ticketSchema);
}
export async function logout() {
  return request(api.access.logout.$post(), authenticatedSchema);
}
function requireWebAuthn() {
  if (!browserSupportsWebAuthn()) {
    throw new Error(localize("frontend:access.webAuthnUnsupported"));
  }
}
