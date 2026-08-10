import { Badge, IconButton } from "../ParkUI";
import { CircleStop, LoaderCircle } from "lucide-react";
import { type MouseEvent, useState } from "react";
import type { ToolCallPhase } from "../../../timeline";
import { css } from "styled-system/css";
import { reportPromiseErrors } from "../../services/errors";
import { useTranslation } from "react-i18next";

const accessory = css({ alignItems: "center", display: "flex", gap: "2" }),
  stopButton = css({
    borderWidth: "0",
    color: "statusTool",
    h: "6",
    minW: "6",
    p: 0,
  });
export function useToolAccessory({
  callId,
  cancellable,
  onCancel,
  phase,
}: {
  callId: string;
  cancellable: boolean;
  onCancel: (toolCallId: string) => Promise<void>;
  phase: ToolCallPhase;
}) {
  const { t } = useTranslation(),
    [cancelling, setCancelling] = useState(false),
    handleCancel = useCancellationHandler(callId, onCancel, setCancelling);
  return phase === "streaming" || cancellable ? (
    <span className={accessory}>
      {phase === "streaming" ? <Badge>{t("streaming")}</Badge> : null}
      {cancellable ? (
        <IconButton
          aria-label={t("stopTool")}
          className={stopButton}
          disabled={cancelling}
          onClick={handleCancel}
          title={t("stopTool")}
          type="button"
          variant="ghost"
        >
          {cancelling ? (
            <LoaderCircle aria-hidden size={14} />
          ) : (
            <CircleStop aria-hidden size={14} />
          )}
        </IconButton>
      ) : null}
    </span>
  ) : undefined;
}
function useCancellationHandler(
  callId: string,
  onCancel: (toolCallId: string) => Promise<void>,
  setCancelling: (cancelling: boolean) => void,
) {
  return (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setCancelling(true);
    reportPromiseErrors(cancelTool(callId, onCancel, setCancelling));
  };
}
async function cancelTool(
  callId: string,
  onCancel: (toolCallId: string) => Promise<void>,
  setCancelling: (cancelling: boolean) => void,
) {
  try {
    await onCancel(callId);
  } catch (error: unknown) {
    setCancelling(false);
    throw error;
  }
}
