import { z } from "zod";
import { zfd } from "zod-form-data";

import { localize } from "../../i18n/server";
import type { PendingAttachment } from "../attachments/contract";
import { messageSubmissionSchema, sessionSubmissionSchema } from "../attachments/submission";
import { validate } from "./request";

const attachmentsSchema = z.array(
  z.tuple([
    z.string().regex(/^file:[0-9a-z]{8}$/u),
    z
      .file()
      .refine(
        (file) => typeof file.name === "string" && file.name.length > 0,
        localize("http:multipart.fileNameMissing"),
      ),
  ]),
);
export const messageForm = validate("form", submissionBody(messageSubmissionSchema)),
  sessionForm = validate("form", submissionBody(sessionSubmissionSchema));
function submissionBody<Schema extends z.ZodType<object>>(
  schema: Schema,
): z.ZodType<z.output<Schema> & { attachments: PendingAttachment[] }, Record<string, unknown>>;
function submissionBody(schema: z.ZodType<object>) {
  return z
    .preprocess(
      ({ submission, ...files }: Record<string, unknown>) => ({
        files: Object.entries(files),
        submission,
      }),
      z.object({ files: attachmentsSchema, submission: zfd.json(schema) }),
    )
    .transform(({ files, submission }) => ({
      ...submission,
      attachments: files.map(([key, file]) => ({
        file,
        id: key.slice("file:".length),
      })),
    }));
}
