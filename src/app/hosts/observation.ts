import type { BrowserWarning, HostActivity, StreamEvent } from "../../types";
import type { ErrorDetails } from "../../failures/details";
import type { HostObserver } from "../../runtime/context";

export interface RunningHost {
  activity: HostActivity;
  done: Promise<void>;
  force: AbortController;
  ready: Promise<void>;
  stopping: AbortController;
  cancelTool: (callId: string) => boolean;
}
export interface AppHostEvents {
  activity: (sessionId: string, activity: HostActivity) => void;
  changed: (sessionId: string) => void;
  failure: (sessionId: string, error: ErrorDetails) => void;
  transcript: (sessionId: string, event: StreamEvent) => void;
  warning: (sessionId: string, warning: BrowserWarning) => void;
  wait: (sessionId: string, delayMs: number) => Promise<void>;
}
export function createHostObserver(
  events: AppHostEvents,
  running: Map<string, RunningHost>,
  force: AbortController,
): HostObserver {
  return {
    activity: (sessionId, activity) => {
      const host = running.get(sessionId);
      if (host?.force !== force || host.activity === activity) {
        return;
      }
      host.activity = activity;
      events.activity(sessionId, activity);
    },
    changed: (sessionId) => {
      events.changed(sessionId);
    },
    failure: (sessionId, error) => {
      events.failure(sessionId, error);
    },
    token: () => undefined,
    transcript: (sessionId, event) => {
      events.transcript(sessionId, event);
    },
    warning: (sessionId, warning) => {
      events.warning(sessionId, warning);
    },
  };
}
