import { BrushCleaning, Trash2 } from "lucide-react";
import { useCallback, useMemo } from "react";
import { ActionPanel } from "./ActionPanel";
import type { ChatControlState } from "../../actionState";
import { ConfirmAction } from "./ConfirmAction";
import { ContextUsage } from "../../ContextUsage";
import type { Control } from "../../../../../../types";
import { RuntimeControl } from "./RuntimeControl";
import { SubmitButton } from "./SubmitButton";
import type { TokenUsage } from "../../../../../timeline";
import { clearTemporaryFiles } from "../../../../services/client";
import { useTranslation } from "react-i18next";

export function Actions({
  controlDisabled,
  controlState,
  deleteDisabled,
  sessionId,
  submitDisabled,
  submitLabel,
  stepAvailable = false,
  usage,
  onControl,
  onDelete,
}: {
  controlDisabled: boolean;
  controlState?: ChatControlState;
  deleteDisabled: boolean;
  sessionId?: string;
  submitDisabled: boolean;
  submitLabel?: string;
  stepAvailable?: boolean;
  usage?: TokenUsage | null;
  onControl?: (control: Extract<Control, "running" | "step" | "pause">) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const { t } = useTranslation(),
    cleanup = useCallback(async () => {
      if (sessionId) {
        const { skipped } = await clearTemporaryFiles(sessionId);
        if (skipped.length > 0) {
          console.warn(t("cleanupSkipped", { count: skipped.length }), skipped);
        }
      }
    }, [sessionId, t]),
    footer = useMemo(
      () => (usage !== undefined ? <ContextUsage usage={usage} /> : undefined),
      [usage],
    );
  return (
    <ActionPanel footer={footer}>
      {onDelete ? (
        <ConfirmAction
          confirmation={t("confirmDelete")}
          disabled={deleteDisabled}
          disabledLabel={t("pauseBeforeDelete")}
          label={t("deleteSession")}
          onConfirm={onDelete}
        >
          <Trash2 aria-hidden size={16} />
        </ConfirmAction>
      ) : null}
      {sessionId ? (
        <ConfirmAction
          confirmation={t("confirmCleanup")}
          label={t("clearTemporaryFiles")}
          onConfirm={cleanup}
        >
          <BrushCleaning aria-hidden size={16} />
        </ConfirmAction>
      ) : null}
      {onControl ? (
        <RuntimeControl
          controlDisabled={controlDisabled}
          controlState={controlState}
          onControl={onControl}
          stepAvailable={stepAvailable}
        />
      ) : null}
      <SubmitButton disabled={submitDisabled} label={submitLabel ?? t("send")} />
    </ActionPanel>
  );
}
