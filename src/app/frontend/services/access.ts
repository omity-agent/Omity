import {
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { api, request } from "./httpTransport";
import { z } from "./validation";

const accessStatusSchema = z.object({
    authenticated: z.boolean(),
    configured: z.boolean(),
    credentialCount: z.number().int().nonnegative(),
    local: z.boolean(),
    publicOrigin: z.string().nullable(),
  }),
  loginOptionsSchema = z.object({
    options: z.custom<PublicKeyCredentialRequestOptionsJSON>(),
  }),
  registrationOptionsSchema = z.object({
    options: z.custom<PublicKeyCredentialCreationOptionsJSON>(),
    origin: z.string(),
  }),
  authenticatedSchema = z.object({ authenticated: z.boolean() }),
  registeredSchema = z.object({
    credentialCount: z.number().int().positive(),
    verified: z.boolean(),
  }),
  ticketSchema = z.object({ ticket: z.string().min(1) });
export type AccessStatus = z.infer<typeof accessStatusSchema>;
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
    throw new Error(`请通过 ${origin} 打开 WebUI 后注册通行密钥`);
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
    throw new Error("当前浏览器或页面安全上下文不支持 WebAuthn");
  }
}
