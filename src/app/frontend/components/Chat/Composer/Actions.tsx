import { Button, IconButton } from "../../ParkUI";
import { Pause, Play, Send, StepForward } from "lucide-react";
import { composerActions, composerControls, resumeControls } from "./layout";
import { ContextUsage } from "../ContextUsage";
import type { Control } from "../../../../../types";
import { DeleteSessionButton } from "../DeleteSessionButton";
import type { TokenUsage } from "../../../../timeline";
import { reportPromiseErrors } from "../../../services/errors";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

type ControlState = "pause" | "pausing" | "resume";
type RequestedControl = Extract<Control, "running" | "step" | "pause">;
export function Actions({
  controlDisabled,
  controlState,
  deleteDisabled,
  submitDisabled,
  usage,
  onControl,
  onDelete,
}: {
  controlDisabled: boolean;
  controlState?: ControlState;
  deleteDisabled: boolean;
  submitDisabled: boolean;
  usage?: TokenUsage | null;
  onControl?: (control: RequestedControl) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const requestControl = useCallback(
    (control: RequestedControl) => {
      if (onControl) {
        reportPromiseErrors(onControl(control));
      }
    },
    [onControl],
  );
  const pause = useCallback(() => {
    requestControl("pause");
  }, [requestControl]);
  const resume = useCallback(() => {
    requestControl("running");
  }, [requestControl]);
  const step = useCallback(() => {
    requestControl("step");
  }, [requestControl]);
  const controlLabel = controlState ? t(controlState) : "";
  const resumeLabel = t("resumeContinuous");
  const stepLabel = t("step");
  const control =
    controlState === "resume" ? (
      <div aria-label={t("resume")} className={resumeControls} role="group">
        <IconButton
          aria-label={resumeLabel}
          disabled={controlDisabled}
          onClick={resume}
          title={resumeLabel}
          type="button"
        >
          <Play size={14} />
        </IconButton>
        <IconButton
          aria-label={stepLabel}
          disabled={controlDisabled}
          onClick={step}
          title={stepLabel}
          type="button"
        >
          <StepForward size={14} />
        </IconButton>
      </div>
    ) : controlState ? (
      <IconButton
        aria-label={controlLabel}
        disabled={controlDisabled}
        onClick={pause}
        title={controlLabel}
        type="button"
      >
        <Pause size={14} />
      </IconButton>
    ) : null;
  return (
    <div className={composerActions}>
      <div className={composerControls}>
        <Button disabled={submitDisabled} type="submit" variant="outline">
          <Send size={14} /> {t("send")}
        </Button>
        {onControl ? control : null}
        {onDelete ? <DeleteSessionButton disabled={deleteDisabled} onDelete={onDelete} /> : null}
      </div>
      {usage !== undefined ? <ContextUsage usage={usage} /> : null}
    </div>
  );
}
