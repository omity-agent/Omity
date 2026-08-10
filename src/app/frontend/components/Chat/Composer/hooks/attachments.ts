import { useCallback, useMemo } from "react";
import type { AttachmentSettings } from "../../../../../attachments/contract";
import { PendingAttachments } from "../attachments";

export function usePendingAttachments(settings?: AttachmentSettings) {
  const attachments = useMemo(() => new PendingAttachments(settings), [settings]);
  const attachmentValues = useCallback(
    (submittedContent: string) => attachments.values(submittedContent),
    [attachments],
  );
  const clearAttachments = useCallback(() => {
    attachments.clear();
  }, [attachments]);
  const handlePasteFiles = useCallback(
    (files: File[], content: string) => attachments.paste(files, content),
    [attachments],
  );
  return { attachmentValues, clearAttachments, handlePasteFiles };
}
