import type { PendingAttachment } from "./contract";
import { settingsProfileNameSchema } from "../../infrastructure/configuration/settings/profileNames";
import { z } from "zod";

const nonEmptyMessage = z.string().refine((value) => value.trim().length > 0),
  initialPair = z.strictObject({ assistant: nonEmptyMessage, user: nonEmptyMessage });
export const messageSubmissionSchema = z.strictObject({
  content: nonEmptyMessage,
  draftRevision: z.number().int().nonnegative(),
  submissionId: z.string().regex(/^[0-9a-z]{8}$/u),
});
export const sessionSubmissionSchema = z.strictObject({
  history: z.array(initialPair),
  hookOverrides: z.record(z.string().min(1), z.boolean()).optional(),
  message: nonEmptyMessage,
  profile: settingsProfileNameSchema.optional(),
  workspace: z.string().trim().min(1).max(32_767),
});
export type MessageSubmission = z.infer<typeof messageSubmissionSchema> & {
  attachments: PendingAttachment[];
};
export type SessionSubmission = z.infer<typeof sessionSubmissionSchema> & {
  attachments: PendingAttachment[];
};
export function submissionForm(
  submission: Omit<MessageSubmission, "attachments"> | Omit<SessionSubmission, "attachments">,
  attachments: PendingAttachment[],
) {
  const body = new FormData();
  body.set("submission", JSON.stringify(submission));
  for (const { id, file } of attachments) {
    body.append(`file:${id}`, file);
  }
  return body;
}
