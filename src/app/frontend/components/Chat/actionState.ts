import type { Control, QueueStatus, SessionStatus } from "../../../../types";
import { pauseRequested, resolvePausePhase } from "../../../pauseState";

export type ChatControlState = "pause" | "pausing" | "resume" | "stepping";
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
  sessionActionDisabled: boolean;
  stepAvailable: boolean;
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
  const sessionActive =
    queueRunning ||
    sessionStatus === "model" ||
    sessionStatus === "tool" ||
    sessionStatus === "pausing";
  const pausePhase = resolvePausePhase({
    paused: queuePaused || sessionStatus === "paused",
    requested: pausing || pauseRequested(control) || sessionStatus === "pausing",
    running: sessionActive,
  });
  const resumable = pausePhase === "paused";
  const waitingForPause = pausePhase === "pausing";
  const stepping = control === "step";
  return {
    controlDisabled:
      stepping || waitingForPause || (!resumable && sessionStatus === "idle" && !queueRunning),
    controlState: stepping
      ? "stepping"
      : waitingForPause
        ? "pausing"
        : resumable || (sessionStatus === "idle" && !queueRunning)
          ? "resume"
          : "pause",
    sessionActionDisabled: sessionActive || stepping,
    stepAvailable: !stepping && resumable && queuePaused,
  };
}
