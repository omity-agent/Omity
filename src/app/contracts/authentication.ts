import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { z } from "zod";

const authenticatorAttachment = z.enum(["cross-platform", "platform"]).optional(),
  credentialBase = {
    authenticatorAttachment,
    clientExtensionResults: z.looseObject({}),
    id: z.string().min(1),
    rawId: z.string().min(1),
    type: z.literal("public-key"),
  };
export const registrationBody: z.ZodType<RegistrationResponseJSON> = z.object({
  ...credentialBase,
  response: z.object({
    attestationObject: z.string().min(1),
    authenticatorData: z.string().min(1).optional(),
    clientDataJSON: z.string().min(1),
    publicKey: z.string().min(1).optional(),
    publicKeyAlgorithm: z.number().int().optional(),
    transports: z.array(z.string()).optional(),
  }),
});
export const authenticationBody: z.ZodType<AuthenticationResponseJSON> = z.object({
  ...credentialBase,
  response: z.object({
    authenticatorData: z.string().min(1),
    clientDataJSON: z.string().min(1),
    signature: z.string().min(1),
    userHandle: z.string().optional(),
  }),
});
export const registrationOptionsBody = z.strictObject({ ticket: z.string().min(1).optional() });
export const accessStatusSchema = z.object({
  authenticated: z.boolean(),
  configured: z.boolean(),
  credentialCount: z.number().int().nonnegative(),
  local: z.boolean(),
  publicOrigin: z.string().nullable(),
});
export const loginOptionsSchema = z.object({
  options: z.custom<PublicKeyCredentialRequestOptionsJSON>(),
});
export const registrationOptionsSchema = z.object({
  options: z.custom<PublicKeyCredentialCreationOptionsJSON>(),
  origin: z.string(),
});
export const authenticatedSchema = z.object({ authenticated: z.boolean() });
export const registeredSchema = z.object({
  credentialCount: z.number().int().positive(),
  verified: z.boolean(),
});
export const ticketSchema = z.object({ ticket: z.string().min(1) });
export type AccessStatus = z.infer<typeof accessStatusSchema>;
