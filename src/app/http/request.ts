import type { HonoRequest } from "hono/request";
import { HttpError } from "./errors";
import { controlCommandSchema } from "../../types";
import { fileLinkActionSchema } from "../../fileLinks/types";
import { safeId } from "../../infrastructure/configuration/sessionPaths";
import { z } from "zod";

export const requestBodyLimit = 1024 * 1024;
export const composerDraftBody = z.strictObject({
  content: z.string(),
  revision: z.number().int().positive(),
});
export const controlBody = z.strictObject({ control: controlCommandSchema });
export const cancelToolBody = z.strictObject({ toolCallId: z.string().min(1).max(1024) });
export const answerToolBody = z.strictObject({
  answer: z.unknown(),
  toolCallId: z.string().min(1).max(1024),
});
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
export async function readJson<T>(request: HonoRequest, schema: z.ZodType<T>): Promise<T> {
  let parsed: unknown;
  try {
    parsed = await request.json<unknown>();
  } catch {
    throw new HttpError(400, "请求体不是有效的 JSON");
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
      .join("; ");
    throw new HttpError(400, `请求参数无效：${details}`);
  }
  return result.data;
}
export function decodeSessionId(value: string) {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new HttpError(400, "Session ID 编码无效");
  }
  try {
    return safeId(decoded);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : String(error));
  }
}
