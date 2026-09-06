import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
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
