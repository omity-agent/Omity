import { LoaderCircle, Pause, Play, StepForward } from "lucide-react";
import type { ChatControlState } from "../../actionState";
import type { Control } from "../../../../../../types";
import { IconButton } from "../../../ParkUI";
import { css } from "styled-system/css";
import { reportPromiseErrors } from "../../../../services/errors";
import { runtimeControls } from "../layout";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

type RequestedControl = Extract<Control, "running" | "step" | "pause">;
const activeIcon = css({ animation: "pulse 1.8s ease-in-out infinite" });
export function RuntimeControl({
  controlDisabled,
  controlState,
  stepAvailable = false,
  onControl,
}: {
  controlDisabled: boolean;
  controlState?: ChatControlState;
  stepAvailable?: boolean;
  onControl?: (control: RequestedControl) => Promise<void>;
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
    cancelPauseLabel = t("cancelPause"),
    control =
      controlState === "resume" || controlState === "stepping" ? (
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
          {stepAvailable || controlState === "stepping" ? (
            <IconButton
              aria-label={controlState === "stepping" ? controlLabel : stepLabel}
              disabled={controlDisabled || controlState === "stepping"}
              onClick={step}
              title={controlState === "stepping" ? controlLabel : stepLabel}
              type="button"
            >
              <StepForward
                className={controlState === "stepping" ? activeIcon : undefined}
                size={16}
              />
            </IconButton>
          ) : null}
        </>
      ) : controlState ? (
        <IconButton
          aria-label={controlState === "pausing" ? cancelPauseLabel : controlLabel}
          disabled={controlDisabled}
          onClick={controlState === "pause" ? pause : resume}
          title={controlState === "pausing" ? cancelPauseLabel : controlLabel}
          type="button"
        >
          {controlState === "pausing" ? (
            <LoaderCircle className={activeIcon} size={16} />
          ) : (
            <Pause size={16} />
          )}
        </IconButton>
      ) : null;
  return (
    <div aria-label={controlLabel} className={runtimeControls} role="group">
      {control}
    </div>
  );
}
