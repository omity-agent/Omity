import { LoaderCircle, Pause, Play, Send, StepForward } from "lucide-react";
import { composerActions, composerControls, runtimeControls } from "./layout";
import type { ChatControlState } from "../actionState";
import { ContextUsage } from "../ContextUsage";
import type { Control } from "../../../../../types";
import { DeleteSessionButton } from "../DeleteSessionButton";
import { IconButton } from "../../ParkUI";
import type { TokenUsage } from "../../../../timeline";
import { css } from "styled-system/css";
import { reportPromiseErrors } from "../../../services/errors";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

type RequestedControl = Extract<Control, "running" | "step" | "pause">;
const activeIcon = css({ animation: "pulse 1.8s ease-in-out infinite" }),
  sendAction = css({
    _hover: {
      bg: "mutedStrong",
      borderColor: "mutedStrong",
    },
    bg: "text",
    borderColor: "text",
    color: "canvas",
  });
export function Actions({
  controlDisabled,
  controlState,
  deleteDisabled,
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
  submitDisabled: boolean;
  submitLabel?: string;
  stepAvailable?: boolean;
  usage?: TokenUsage | null;
  onControl?: (control: RequestedControl) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const { t } = useTranslation(),
    requestControl = useCallback(
      (control: RequestedControl) => {
        if (onControl) {
          reportPromiseErrors(onControl(control));
        }
      },
      [onControl],
    ),
    pause = useCallback(() => {
      requestControl("pause");
    }, [requestControl]),
    resume = useCallback(() => {
      requestControl("running");
    }, [requestControl]),
    step = useCallback(() => {
      requestControl("step");
    }, [requestControl]),
    controlLabel = controlState ? t(controlState) : "",
    resumeLabel = t("resumeContinuous"),
    stepLabel = t("step"),
    control =
      controlState === "resume" ? (
        <>
          <IconButton
            aria-label={resumeLabel}
            disabled={controlDisabled}
            onClick={resume}
            title={resumeLabel}
            type="button"
          >
            <Play size={16} />
          </IconButton>
          {stepAvailable ? (
            <IconButton
              aria-label={stepLabel}
              disabled={controlDisabled}
              onClick={step}
              title={stepLabel}
              type="button"
            >
              <StepForward size={16} />
            </IconButton>
          ) : null}
        </>
      ) : controlState ? (
        <IconButton
          aria-label={controlLabel}
          disabled={controlDisabled}
          onClick={controlState === "pause" ? pause : undefined}
          title={controlLabel}
          type="button"
        >
          {controlState === "pausing" ? (
            <LoaderCircle className={activeIcon} size={16} />
          ) : controlState === "stepping" ? (
            <StepForward size={16} />
          ) : (
            <Pause size={16} />
          )}
        </IconButton>
      ) : null,
    sendLabel = submitLabel ?? t("send");
  return (
    <div className={composerActions}>
      <div className={composerControls}>
        {onDelete ? <DeleteSessionButton disabled={deleteDisabled} onDelete={onDelete} /> : null}
        {onControl ? (
          <div aria-label={controlLabel} className={runtimeControls} role="group">
            {control}
          </div>
        ) : null}
        <IconButton
          aria-label={sendLabel}
          className={submitDisabled ? undefined : sendAction}
          disabled={submitDisabled}
          title={sendLabel}
          type="submit"
        >
          <Send size={16} />
        </IconButton>
      </div>
      {usage !== undefined ? <ContextUsage usage={usage} /> : null}
    </div>
  );
}
