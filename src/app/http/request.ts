import type { AccessEnvironment } from "./access";
import type { HonoRequest } from "hono/request";
import { HttpError } from "./errors";
import { bodyLimit } from "hono/body-limit";
import { controlCommandSchema } from "../../types";
import { createMiddleware } from "hono/factory";
import { fileLinkActionSchema } from "../../fileLinks/types";
import { preparationContentSchema } from "../composition/preparation";
import { requestBodyLimit } from "../../../settings/networking";
import { safeId } from "../../infrastructure/configuration/sessionPaths";
import { z } from "zod";

export function limitRequestBody(maxSize = requestBodyLimit, label = "请求体") {
  return bodyLimit({
    maxSize,
    onError() {
      throw new HttpError(413, `${label}不能超过 ${maxSize.toString()} 字节`);
    },
  });
}
const regularBodyLimit = limitRequestBody();
export const composerDraftBody = z.strictObject({
  content: z.string(),
  revision: z.number().int().positive(),
});
export const preparationDraftBody = composerDraftBody.extend({
  content: preparationContentSchema,
});
export const controlBody = z.strictObject({ control: controlCommandSchema });
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
async function readJson<T>(request: HonoRequest, schema: z.ZodType<T>): Promise<T> {
  let parsed: unknown;
  try {
    parsed = await request.json<unknown>();
  } catch {
    throw new HttpError(400, "请求体不是有效的 JSON");
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new HttpError(400, `请求参数无效：${z.prettifyError(result.error)}`);
  }
  return result.data;
}
export function jsonBody<T extends object>(schema: z.ZodType<T>) {
  return createMiddleware<AccessEnvironment, string, { in: { json: T }; out: { json: T } }>(
    (c, next) =>
      regularBodyLimit(c, async () => {
        c.req.addValidatedData("json", await readJson(c.req, schema));
        await next();
      }),
  );
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
