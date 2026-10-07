import { DomainError } from "../../errors";
import type { Settings } from "../../types";
import { localize } from "../../i18n/server";

export type { MessageSubmission, SessionSubmission } from "./submission";
export interface PendingAttachment {
  id: string;
  file: File;
}
export type AttachmentSettings = Settings["attachments"];
interface AttachmentMetadata {
  name: string;
  size: number;
}
const placeholderPattern = /\{\{file:(?<id>[0-9a-z]{8}):(?<name>[^{}\r\n]+)\}\}/giu;
export function attachmentPlaceholder(id: string, name: string) {
  return `{{file:${id}:${name.replaceAll(/[{}\r\n]/gu, "_")}}}`;
}
export function attachmentIds(content: string) {
  return new Set(
    [...content.matchAll(placeholderPattern)].map((match) =>
      (match.groups?.["id"] ?? "").toLowerCase(),
    ),
  );
}
export function fileSuffix(name: string) {
  const index = name.lastIndexOf(".");
  return index > 0 ? name.slice(index).toLowerCase() : "";
}
function validateAttachment(
  file: unknown,
  settings: AttachmentSettings,
): asserts file is AttachmentMetadata {
  if (
    typeof file !== "object" ||
    file === null ||
    !("name" in file) ||
    typeof file.name !== "string" ||
    file.name.length === 0
  ) {
    throw new DomainError(
      "ATTACHMENT_INVALID",
      localize("application:attachments.fileNameMissing"),
    );
  }
  if (
    !("size" in file) ||
    typeof file.size !== "number" ||
    !Number.isSafeInteger(file.size) ||
    file.size < 0
  ) {
    throw new DomainError(
      "ATTACHMENT_INVALID",
      localize("application:attachments.sizeInvalid", { value0: file.name }),
    );
  }
  const suffix = fileSuffix(file.name);
  if (!settings.allowedSuffixes.includes(suffix)) {
    throw new DomainError(
      "ATTACHMENT_INVALID",
      localize("application:attachments.suffixUnsupported", {
        value0: suffix || localize("errors:generic.noSuffix"),
      }),
    );
  }
  if (file.size > settings.maxSizeBytes) {
    throw new DomainError(
      "ATTACHMENT_TOO_LARGE",
      localize("application:attachments.fileTooLarge", {
        value0: file.name,
        value1: settings.maxSizeBytes.toString(),
      }),
    );
  }
}
export function validateAttachmentBatch(files: readonly unknown[], settings: AttachmentSettings) {
  let total = 0;
  for (const file of files) {
    validateAttachment(file, settings);
    total += file.size;
  }
  if (!Number.isSafeInteger(total)) {
    throw new DomainError(
      "ATTACHMENT_TOO_LARGE",
      localize("application:attachments.totalSizeUnsafe"),
    );
  }
  if (total > settings.maxSizeBytes) {
    throw new DomainError(
      "ATTACHMENT_TOO_LARGE",
      localize("application:attachments.totalSizeTooLarge", {
        value0: settings.maxSizeBytes.toString(),
      }),
    );
  }
}
