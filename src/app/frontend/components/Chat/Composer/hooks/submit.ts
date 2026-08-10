import {
  type ComposerDraftTarget,
  clearTemporaryComposerDraft,
} from "../../../../services/composerDrafts";
import type { PendingAttachment } from "../../../../../attachments/contract";

export async function submitMessage({
  attachments,
  clearPending,
  draftTarget,
  onSend,
  restore,
  submittedContent,
  submittedRevision,
}: {
  attachments: PendingAttachment[];
  clearPending: () => void;
  draftTarget: ComposerDraftTarget;
  onSend: (
    content: string,
    draftRevision: number,
    attachments: PendingAttachment[],
  ) => Promise<void>;
  restore: () => void;
  submittedContent: string;
  submittedRevision: number;
}) {
  clearPending();
  if (draftTarget.kind === "new") {
    clearTemporaryComposerDraft();
  }
  try {
    await onSend(submittedContent, submittedRevision, attachments);
  } catch (error) {
    restore();
    throw error;
  }
}
