import type { HighlightRequest, HighlightResponse } from "./worker";

interface HighlightJob {
  canceled: boolean;
  input: Omit<HighlightRequest, "id">;
  onError: (error: Error) => void;
  onResult: (result: HighlightedCodeResult) => void;
}
export interface HighlightedCodeResult {
  code: string;
  language?: string;
  lines: string[];
  sourceLines: string[];
}
let active: (HighlightJob & { id: number }) | undefined,
  nextId = 1,
  queue: HighlightJob[] = [],
  worker: Worker | undefined;
export function scheduleHighlight(
  input: HighlightJob["input"],
  onResult: HighlightJob["onResult"],
  onError: HighlightJob["onError"],
) {
  const job: HighlightJob = { canceled: false, input, onError, onResult };
  queue.push(job);
  startNext();
  return () => {
    job.canceled = true;
  };
}
function startNext() {
  if (active) {
    return;
  }
  let job: HighlightJob | undefined;
  while ((job = queue.pop())?.canceled) {}
  if (!job) {
    return;
  }
  const id = nextId;
  nextId += 1;
  active = { ...job, id };
  workerInstance().postMessage({ ...job.input, id } satisfies HighlightRequest, []);
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
  active = undefined;
  if (!job.canceled) {
    if ("error" in event.data) {
      job.onError(new Error(`代码高亮失败：${event.data.error}`));
    } else {
      job.onResult({
        ...event.data.result,
        ...job.input,
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
  if (job && !job.canceled) {
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
