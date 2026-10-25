import type { Control } from "../../../../../types";
import type { AttachmentSettings, PendingAttachment } from "../../../../attachments/contract";
import type { TokenUsage } from "../../../../timeline";
import type { ComposerDraftTarget } from "../../../services/composerDrafts";
import type { OptimisticUser } from "../../../services/transcript/optimistic";
import type { ChatControlState } from "../actionState";
import type { AskUserAnswer, AskUserQuestion } from "../toolActions";

export interface ComposerProps {
  disabled: boolean;
  attachmentSettings?: AttachmentSettings;
  cacheHitWarningRatio?: number;
  availableProfiles?: string[];
  currentProfile?: string;
  draft?: string;
  draftSaveDelayMs?: number;
  draftTarget: ComposerDraftTarget;
  userMessages: readonly string[];
  predictions?: readonly string[];
  controlDisabled?: boolean;
  controlState?: ChatControlState;
  deleteDisabled?: boolean;
  profileChangeDisabled?: boolean;
  profileChangePending?: boolean;
  stepAvailable?: boolean;
  usage?: TokenUsage | null;
  askUser?: AskUserQuestion | null;
  onControl?: (control: Extract<Control, "running" | "step" | "pause">) => Promise<void>;
  onDelete?: () => Promise<void>;
  onAnswer?: (callId: string, answer: AskUserAnswer) => Promise<void>;
  onProfileChange?: (profile?: string) => void | Promise<void>;
  onSend: (
    optimistic: OptimisticUser,
    draftRevision: number,
    attachments: PendingAttachment[],
  ) => Promise<void>;
}
