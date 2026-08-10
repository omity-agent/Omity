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
  const queueRunning = queue.some(({ status }) => status === "running"),
    queuePaused = queue.some(({ status }) => status === "paused"),
    sessionActive =
      queueRunning ||
      sessionStatus === "model" ||
      sessionStatus === "tool" ||
      sessionStatus === "pausing",
    pausePhase = resolvePausePhase({
      paused: queuePaused || sessionStatus === "paused",
      requested: pausing || pauseRequested(control) || sessionStatus === "pausing",
      running: sessionActive,
    }),
    resumable = pausePhase === "paused",
    waitingForPause = pausePhase === "pausing",
    stepping = control === "step";
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
