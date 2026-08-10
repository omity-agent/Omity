import { useCallback, useEffect, useRef } from "react";
import type { AttachmentSettings } from "../../../../../attachments/contract";
import { PendingAttachments } from "../attachments";

export function usePendingAttachments(settings?: AttachmentSettings) {
  const attachmentsRef = useRef(new PendingAttachments(settings));
  useEffect(() => {
    attachmentsRef.current.configure(settings);
  }, [settings]);
  const attachmentValues = useCallback(
      (submittedContent: string) => attachmentsRef.current.values(submittedContent),
      [attachmentsRef],
    ),
    clearAttachments = useCallback(() => {
      attachmentsRef.current.clear();
    }, [attachmentsRef]),
    handlePasteFiles = useCallback(
      (files: File[], content: string) => attachmentsRef.current.paste(files, content),
      [attachmentsRef],
    );
  return { attachmentValues, clearAttachments, handlePasteFiles };
}
