import type { AttachmentSettings, PendingAttachment } from "../../../../attachments/contract";
import type { ComposerDraftTarget } from "../../../services/composerDrafts";
import type { Control } from "../../../../../types";
import type { TokenUsage } from "../../../../timeline";

type ControlState = "pause" | "pausing" | "resume";
export interface ComposerProps {
  disabled: boolean;
  attachmentSettings?: AttachmentSettings;
  draft?: string;
  draftSaveDelayMs?: number;
  draftTarget: ComposerDraftTarget;
  userMessages: readonly string[];
  controlDisabled?: boolean;
  controlState?: ControlState;
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
