import { messageSubmissionSchema, sessionSubmissionSchema } from "../attachments/submission";
import type { HonoRequest } from "hono/request";
import { HttpError } from "./errors";
import { z } from "zod";
import { zfd } from "zod-form-data";

const attachmentsSchema = z.array(
  z.tuple([
    z.string().regex(/^file:[0-9a-z]{8}$/u),
    z
      .file()
      .refine(
        (file) => typeof file.name === "string" && file.name.length > 0,
        "附件缺少有效文件名",
      ),
  ]),
);
export function readMessageForm(request: HonoRequest) {
  return readSubmission(request, messageSubmissionSchema);
}
export function readSessionForm(request: HonoRequest) {
  return readSubmission(request, sessionSubmissionSchema);
}
async function readSubmission<T extends object>(request: HonoRequest, schema: z.ZodType<T>) {
  let fields: Record<string, unknown>;
  try {
    fields = await request.parseBody({ all: true });
  } catch {
    throw new HttpError(400, "请求体不是有效的 multipart/form-data");
  }
  const { submission, ...files } = fields,
    result = z
      .object({
        files: attachmentsSchema,
        submission: zfd.json(schema),
      })
      .safeParse({ files: Object.entries(files), submission });
  if (!result.success) {
    throw new HttpError(400, `提交参数无效：${z.prettifyError(result.error)}`);
  }
  return {
    ...result.data.submission,
    attachments: result.data.files.map(([key, file]) => ({
      file,
      id: key.slice("file:".length),
    })),
  };
}
