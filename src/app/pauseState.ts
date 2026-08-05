import type { Control } from "../types";

export type PausePhase = "active" | "pausing" | "paused";
export function pauseRequested(control: Control) {
  return control === "pause" || control === "pause_cancel";
}
export function resolvePausePhase({
  paused,
  requested,
  running,
}: {
  paused: boolean;
  requested: boolean;
  running: boolean;
}): PausePhase {
  if (running) {
    return requested ? "pausing" : "active";
  }
  return requested || paused ? "paused" : "active";
}
