import type { Control, SessionStatus } from "../../../../types";

export type ChatControlState = "pause" | "pausing" | "resume";
type RequestedControl = Extract<Control, "running" | "pause">;
interface QueueState {
  status: string;
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
type PausePhase = "available" | "requested" | "reached";
export function pauseRequestPending(
  requestedSessionId: string | undefined,
  activeSessionId: string | undefined,
  queue: QueueState[],
) {
  return (
    requestedSessionId === activeSessionId &&
    queue.some(({ status }) => status === "pending" || status === "running")
  );
}
export function deriveChatActionState({
  control,
  pausing,
  queue,
  sessionStatus,
}: ChatActionInput): ChatActionState {
  const queueRunning = queue.some(({ status }) => status === "running");
  const queueInProgress = queue.some(({ status }) => status === "pending" || status === "running");
  const queuePaused = queue.some(({ status }) => status === "paused");
  const pausePhase = resolvePausePhase(control, pausing, queueInProgress, queuePaused);
  const resumable = pausePhase === "reached";
  const waitingForPause = pausePhase === "requested";
  return {
    controlDisabled: waitingForPause || (!resumable && sessionStatus === "idle" && !queueRunning),
    controlState: waitingForPause ? "pausing" : resumable ? "resume" : "pause",
    deleteDisabled: queueRunning || sessionStatus === "model" || sessionStatus === "tool",
    nextControl: resumable ? "running" : "pause",
    queueRunning,
  };
}
function resolvePausePhase(
  control: Control,
  locallyRequested: boolean,
  queueInProgress: boolean,
  queuePaused: boolean,
): PausePhase {
  const requested = locallyRequested || control === "pause" || control === "pause_cancel";
  if (queueInProgress) {
    return requested ? "requested" : "available";
  }
  return requested || queuePaused ? "reached" : "available";
}
