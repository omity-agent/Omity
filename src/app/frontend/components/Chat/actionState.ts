import type { Control, QueueStatus, SessionStatus } from "../../../../types";
import { pauseRequested, resolvePausePhase } from "../../../pauseState";

export type ChatControlState = "pause" | "pausing" | "resume";
type RequestedControl = Extract<Control, "running" | "pause">;
interface QueueState {
  status: QueueStatus;
}
interface ChatActionInput {
  control: Control;
  pausing: boolean;
  queue: QueueState[];
  sessionStatus?: SessionStatus;
}
export interface ChatActionState {
  controlDisabled: boolean;
  controlState: ChatControlState;
  deleteDisabled: boolean;
  nextControl: RequestedControl;
  queueRunning: boolean;
}
export function pauseRequestPending(
  requestedSessionId: string | undefined,
  activeSessionId: string | undefined,
  queue: QueueState[],
) {
  return requestedSessionId === activeSessionId && queue.some(({ status }) => status === "running");
}
export function deriveChatActionState({
  control,
  pausing,
  queue,
  sessionStatus,
}: ChatActionInput): ChatActionState {
  const queueRunning = queue.some(({ status }) => status === "running");
  const queuePaused = queue.some(({ status }) => status === "paused");
  const pausePhase = resolvePausePhase({
    paused: queuePaused,
    requested: pausing || pauseRequested(control),
    running: queueRunning,
  });
  const resumable = pausePhase === "paused";
  const waitingForPause = pausePhase === "pausing";
  return {
    controlDisabled: waitingForPause || (!resumable && sessionStatus === "idle" && !queueRunning),
    controlState: waitingForPause ? "pausing" : resumable ? "resume" : "pause",
    deleteDisabled: queueRunning || sessionStatus === "model" || sessionStatus === "tool",
    nextControl: resumable ? "running" : "pause",
    queueRunning,
  };
}
