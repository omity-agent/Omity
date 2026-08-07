import {
  type ChatActionState,
  deriveChatActionState,
  pauseRequestPending,
} from "../../../src/app/frontend/components/Chat/actionState";
import type { Control, QueueStatus, SessionStatus } from "../../../src/types";
import { expect, test } from "bun:test";

interface MatrixCase {
  name: string;
  control: Control;
  pausing?: boolean;
  queue: QueueStatus[];
  sessionStatus: SessionStatus;
  expected: ChatActionState;
}
const matrix: MatrixCase[] = [
  {
    control: "running",
    expected: state("pause", true, false),
    name: "idle session without active queue",
    queue: [],
    sessionStatus: "idle",
  },
  {
    control: "running",
    expected: state("pause", false, true),
    name: "orphan running queue on an idle session",
    queue: ["running"],
    sessionStatus: "idle",
  },
  {
    control: "running",
    expected: state("resume", false, false),
    name: "persisted paused queue with stale running control",
    queue: ["paused"],
    sessionStatus: "idle",
  },
  {
    control: "running",
    expected: state("pause", false, true),
    name: "running queue takes precedence over a paused queue",
    queue: ["paused", "running"],
    sessionStatus: "idle",
  },
  {
    control: "pause",
    expected: state("resume", false, false),
    name: "pending append remains resumable with its paused run",
    queue: ["paused", "pending"],
    sessionStatus: "paused",
  },
  {
    control: "pause",
    expected: state("resume", false, false),
    name: "pause control without a paused queue",
    queue: [],
    sessionStatus: "idle",
  },
  {
    control: "pause_cancel",
    expected: state("pausing", true, true),
    name: "pause-cancel request while a queue is still running",
    queue: ["running"],
    sessionStatus: "idle",
  },
  {
    control: "pause",
    expected: state("pausing", true, true),
    name: "persisted pause request before the running queue reaches a boundary",
    pausing: true,
    queue: ["running"],
    sessionStatus: "model",
  },
  {
    control: "pause",
    expected: state("resume", false, false),
    name: "pending queue has already reached a requested pause",
    queue: ["pending"],
    sessionStatus: "paused",
  },
  {
    control: "running",
    expected: state("resume", false, false),
    name: "local pause request with an unstarted queue is resumable",
    pausing: true,
    queue: ["pending"],
    sessionStatus: "paused",
  },
  {
    control: "pause",
    expected: state("pausing", true, true),
    name: "pause request received from another client while the queue is running",
    queue: ["running"],
    sessionStatus: "model",
  },
  {
    control: "running",
    expected: state("pausing", true, true),
    name: "locally pending pause",
    pausing: true,
    queue: ["running"],
    sessionStatus: "model",
  },
  {
    control: "running",
    expected: state("resume", false, false),
    name: "persisted pause supersedes a stale local pausing flag",
    pausing: true,
    queue: ["paused"],
    sessionStatus: "idle",
  },
  {
    control: "running",
    expected: state("pause", false, true),
    name: "active model without a queue",
    queue: [],
    sessionStatus: "model",
  },
  {
    control: "running",
    expected: state("pausing", true, true),
    name: "server-reported pause transition without a running queue snapshot",
    queue: [],
    sessionStatus: "pausing",
  },
];
test.each(matrix)("derives chat actions for $name", (entry) => {
  expect(
    deriveChatActionState({
      control: entry.control,
      pausing: entry.pausing ?? false,
      queue: entry.queue.map((status) => ({ status })),
      sessionStatus: entry.sessionStatus,
    }),
  ).toEqual(entry.expected);
});
test("pause request remains pending until the running queue reaches a boundary", () => {
  expect(pauseRequestPending("session", "session", [{ status: "pending" }])).toBe(false);
  expect(pauseRequestPending("session", "session", [{ status: "running" }])).toBe(true);
  expect(
    pauseRequestPending("session", "session", [{ status: "paused" }, { status: "pending" }]),
  ).toBe(false);
  expect(pauseRequestPending("session", "session", [{ status: "paused" }])).toBe(false);
  expect(pauseRequestPending("session", "session", [{ status: "done" }])).toBe(false);
});
function state(
  controlState: ChatActionState["controlState"],
  controlDisabled: boolean,
  sessionActionDisabled: boolean,
): ChatActionState {
  return {
    controlDisabled,
    controlState,
    sessionActionDisabled,
  };
}
