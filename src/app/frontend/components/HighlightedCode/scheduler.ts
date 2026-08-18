import type { HighlightRequest, HighlightResponse } from "./worker";
import type { HighlightInput } from "./markup";

interface HighlightJob {
  canceled: boolean;
  input: HighlightInput;
  kind: "highlight";
  onError: (error: Error) => void;
  onResult: (result: HighlightedCodeResult) => void;
}
interface ReleaseJob {
  canceled: boolean;
  kind: "release";
  streamId: string;
}
type WorkerJob = HighlightJob | ReleaseJob;
export interface HighlightedCodeResult {
  code: string;
  language: string;
  lines: string[];
  sourceLines: string[];
}
let active: (WorkerJob & { id: number }) | undefined,
  nextId = 1,
  queue: WorkerJob[] = [],
  worker: Worker | undefined;
export function scheduleHighlight(
  input: HighlightInput,
  onResult: HighlightJob["onResult"],
  onError: HighlightJob["onError"],
) {
  for (const queued of queue) {
    if (queued.kind === "release" && queued.streamId === input.streamId) {
      queued.canceled = true;
    }
  }
  const job: HighlightJob = {
    canceled: false,
    input,
    kind: "highlight",
    onError,
    onResult,
  };
  queue.push(job);
  startNext();
  return () => {
    job.canceled = true;
  };
}
export function releaseHighlightStream(streamId: string) {
  queue.push({ canceled: false, kind: "release", streamId });
  startNext();
}
function startNext() {
  if (active) {
    return;
  }
  let job: WorkerJob | undefined;
  while ((job = queue.pop())?.canceled) {}
  if (!job) {
    return;
  }
  const id = nextId;
  nextId += 1;
  active = { ...job, id };
  const request: HighlightRequest =
    job.kind === "highlight"
      ? { ...job.input, id, kind: "highlight" }
      : { id, kind: "release", streamId: job.streamId };
  workerInstance().postMessage(request, []);
}
function workerInstance() {
  if (worker) {
    return worker;
  }
  worker = new Worker(new URL("worker.ts", import.meta.url), { type: "module" });
  worker.addEventListener("message", handleMessage);
  worker.addEventListener("error", handleWorkerError);
  return worker;
}
function handleMessage(event: MessageEvent<HighlightResponse>) {
  const job = active;
  if (!job || event.data.id !== job.id) {
    resetWorker(new Error("代码高亮 Worker 返回了无效任务 ID"));
    return;
  }
  if (!("error" in event.data) && event.data.kind !== job.kind) {
    resetWorker(new Error("代码高亮 Worker 返回了无效任务类型"));
    return;
  }
  active = undefined;
  if (!job.canceled) {
    if ("error" in event.data) {
      if (job.kind === "highlight") {
        job.onError(new Error(`代码高亮失败：${event.data.error}`));
      }
    } else if (job.kind === "highlight" && event.data.kind === "highlight") {
      job.onResult({
        ...event.data.result,
        code: job.input.code,
        sourceLines: job.input.code.split("\n"),
      });
    }
  }
  startNext();
}
function handleWorkerError(event: ErrorEvent) {
  resetWorker(new Error(event.message || "代码高亮 Worker 运行失败"));
}
function resetWorker(error: Error) {
  const job = active;
  active = undefined;
  worker?.terminate();
  worker = undefined;
  if (job && !job.canceled && job.kind === "highlight") {
    job.onError(error);
  }
  startNext();
}
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    worker?.terminate();
    worker = undefined;
    active = undefined;
    queue = [];
  });
}
