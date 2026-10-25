import { z } from "zod";

import { requestBodyLimit } from "../../../settings/networking";
import { fileLinkActionSchema } from "../../fileLinks/types";
import { settingsProfileNameSchema } from "../../infrastructure/configuration/settings/profileNames";
import { controlCommandSchema } from "../../types";
import { preparationContentSchema } from "../composition/preparation";

export const composerDraftBody = z.strictObject({
  content: z.string(),
  revision: z.number().int().positive(),
});
export const preparationDraftBody = composerDraftBody.extend({
  content: preparationContentSchema,
});
export const controlBody = z.strictObject({ control: controlCommandSchema });
export const profileBody = z.strictObject({ profile: settingsProfileNameSchema.optional() });
export const cancelToolBody = z.strictObject({ toolCallId: z.string().min(1).max(1024) });
export const answerToolBody = cancelToolBody.extend({ answer: z.unknown() });
export const fileLinkActionBody = z.strictObject({
  action: fileLinkActionSchema,
  path: z.string().min(1).max(32_767),
});
export const forkMaterializationBody = z.strictObject({
  beforeMessageId: z.number().int().positive(),
});
export const reasoningTranslationBody = z.strictObject({
  messageId: z.string().min(1).max(1024),
  source: z.string().min(1).max(requestBodyLimit),
  targetLanguage: z.string().min(1).max(255),
  translated: z.string().min(1).max(requestBodyLimit),
});
