import type {
  MessageSubmission,
  PendingAttachment,
  SessionSubmission,
} from "../attachments/contract";
import type { HonoRequest } from "hono/request";
import { HttpError } from "./errors";
import { controlCommandSchema } from "../../types";
import { fileLinkActionSchema } from "../../fileLinks/types";
import { safeId } from "../../infrastructure/configuration/sessionPaths";
import { settingsProfileNameSchema } from "../../infrastructure/configuration/settings/context";
import { z } from "zod";

export const requestBodyLimit = 1024 * 1024;
const nonEmptyMessage = z.string().refine((value) => value.trim().length > 0),
  historySchema = z.array(z.object({ assistant: nonEmptyMessage, user: nonEmptyMessage }).strict()),
  messageFieldsSchema = z.object({
    content: nonEmptyMessage,
    draftRevision: z
      .string()
      .regex(/^(?<revision>0|[1-9]\d*)$/u)
      .transform(Number)
      .pipe(z.number().int().nonnegative()),
    submissionId: z.string().regex(/^[0-9a-z]{8}$/u),
  }),
  sessionFieldsSchema = z.object({
    history: historySchema,
    hookOverrides: z.record(z.string().min(1), z.boolean()).optional(),
    message: nonEmptyMessage,
    profile: settingsProfileNameSchema.optional(),
    workspace: z.string().trim().min(1).max(32_767),
  });
export const composerDraftBody = z
  .object({
    content: z.string(),
    revision: z.number().int().positive(),
  })
  .strict();
export const controlBody = z.object({ control: controlCommandSchema }).strict();
export const cancelToolBody = z.object({ toolCallId: z.string().min(1).max(1024) }).strict();
export const answerToolBody = z
  .object({
    answer: z.unknown(),
    toolCallId: z.string().min(1).max(1024),
  })
  .strict();
export const fileLinkActionBody = z
  .object({
    action: fileLinkActionSchema,
    path: z.string().min(1).max(32_767),
  })
  .strict();
export const forkMaterializationBody = z
  .object({ beforeMessageId: z.number().int().positive() })
  .strict();
export const reasoningTranslationBody = z
  .object({
    messageId: z.string().min(1).max(1024),
    source: z.string().min(1).max(requestBodyLimit),
    targetLanguage: z.string().min(1).max(255),
    translated: z.string().min(1).max(requestBodyLimit),
  })
  .strict();
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
export async function readMessageForm(request: HonoRequest): Promise<MessageSubmission> {
  const form = await readFormData(request),
    fields = {
      content: singleText(form, "content"),
      draftRevision: singleText(form, "draftRevision"),
      submissionId: singleText(form, "submissionId"),
    },
    result = messageFieldsSchema.safeParse(fields);
  if (!result.success) {
    throw new HttpError(400, `消息参数无效：${result.error.message}`);
  }
  const attachments = readAttachments(form, new Set(Object.keys(fields)));
  return { ...result.data, attachments };
}
export async function readSessionForm(request: HonoRequest): Promise<SessionSubmission> {
  const form = await readFormData(request),
    fields = {
      hookOverrides: form.has("hookOverrides")
        ? parseJsonField(form, "hookOverrides", "Hook 开关")
        : undefined,
      message: singleText(form, "message"),
      profile: optionalText(form, "profile"),
      workspace: singleText(form, "workspace"),
    },
    history = parseJsonField(form, "history", "初始历史消息"),
    result = sessionFieldsSchema.safeParse({ ...fields, history });
  if (!result.success) {
    throw new HttpError(400, `新建会话参数无效：${result.error.message}`);
  }
  const attachments = readAttachments(
    form,
    new Set(["workspace", "profile", "message", "history", "hookOverrides"]),
  );
  return { ...result.data, attachments };
}
function parseJsonField(form: FormData, name: string, label: string) {
  try {
    return JSON.parse(singleText(form, name)) as unknown;
  } catch {
    throw new HttpError(400, `${label}不是有效的 JSON`);
  }
}
async function readFormData(request: HonoRequest) {
  try {
    return await request.formData();
  } catch {
    throw new HttpError(400, "请求体不是有效的 multipart/form-data");
  }
}
function readAttachments(form: FormData, fields: Set<string>) {
  return [...form.entries()].flatMap(([key, value]): PendingAttachment[] => {
    if (fields.has(key)) {
      return [];
    }
    const match = /^file:(?<id>[0-9a-z]{8})$/u.exec(key);
    if (!match || typeof value === "string") {
      throw new HttpError(400, `附件字段无效：${key}`);
    }
    const name: unknown = Reflect.get(value, "name");
    if (typeof name !== "string" || name.length === 0) {
      throw new HttpError(400, `附件缺少有效文件名：${key}`);
    }
    return [{ file: value, id: match.groups?.["id"] ?? "" }];
  });
}
function singleText(form: FormData, name: string) {
  const values = form.getAll(name);
  if (values.length !== 1 || typeof values[0] !== "string") {
    throw new HttpError(400, `表单字段必须是单个文本值：${name}`);
  }
  return values[0];
}
function optionalText(form: FormData, name: string) {
  const values = form.getAll(name);
  if (values.length === 0) {
    return undefined;
  }
  if (values.length !== 1 || typeof values[0] !== "string") {
    throw new HttpError(400, `表单字段必须是单个文本值：${name}`);
  }
  return values[0];
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
