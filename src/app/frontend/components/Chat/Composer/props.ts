import type { AttachmentSettings, PendingAttachment } from "../../../../attachments/contract";
import type { ChatControlState } from "../actionState";
import type { ComposerDraftTarget } from "../../../services/composerDrafts";
import type { Control } from "../../../../../types";
import type { TokenUsage } from "../../../../timeline";

export interface ComposerProps {
  disabled: boolean;
  attachmentSettings?: AttachmentSettings;
  draft?: string;
  draftSaveDelayMs?: number;
  draftTarget: ComposerDraftTarget;
  userMessages: readonly string[];
  controlDisabled?: boolean;
  controlState?: ChatControlState;
  deleteDisabled?: boolean;
  usage?: TokenUsage | null;
  onControl?: (control: Extract<Control, "running" | "step" | "pause">) => Promise<void>;
  onDelete?: () => Promise<void>;
  onSend: (
    content: string,
    draftRevision: number,
    attachments: PendingAttachment[],
  ) => Promise<void>;
}
