import type { HighlightInput, HighlightResult } from "./tokenization";
import { AsyncQueuer } from "@tanstack/pacer/async-queuer";
import { highlightChannel } from "./channel";

export interface HighlightedCodeResult extends HighlightResult {
  code: string;
  sourceLines: string[];
}
function connectHighlighter() {
  const worker = new Worker(new URL("entry.ts", import.meta.url), { type: "module" }),
    rpc = highlightChannel(worker),
    close = (error: Error) => {
      rpc.$close(error);
      worker.terminate();
    };
  worker.addEventListener("error", (event) => {
    close(new Error(event.message || "代码高亮 Worker 运行失败"));
  });
  worker.addEventListener("messageerror", () => {
    close(new Error("代码高亮 Worker 消息无法反序列化"));
  });
  return { close, rpc };
}
interface HighlightJob {
  canceled: boolean;
  streamId: string;
  input?: HighlightInput;
  onError: (error: Error) => void;
  onResult?: (result: HighlightedCodeResult) => void;
}
export class HighlightScheduler {
  private connection?: ReturnType<typeof connectHighlighter>;
  private readonly queue = new AsyncQueuer<HighlightJob>(
    async (job) => {
      if (!this.connection || this.connection.rpc.$closed) {
        this.connection = this.connect();
      }
      const { rpc } = this.connection;
      if (!job.input) {
        await rpc.release(job.streamId);
        return;
      }
      const result = await rpc.highlight(job.input);
      if (!job.canceled) {
        job.onResult?.({
          ...result,
          code: job.input.code,
          sourceLines: job.input.code.split("\n"),
        });
      }
    },
    {
      addItemsTo: "front",
      concurrency: 1,
      getIsExpired: (job) => job.canceled,
      onError: (error, job) => {
        if (!job.canceled) {
          job.onError(error);
        }
      },
    },
  );
  constructor(private readonly connect = connectHighlighter) {}
  schedule(
    input: HighlightInput,
    onResult: NonNullable<HighlightJob["onResult"]>,
    onError: HighlightJob["onError"],
  ) {
    this.cancelPending(input.streamId);
    const job = { canceled: false, input, onError, onResult, streamId: input.streamId };
    this.queue.addItem(job);
    return () => {
      job.canceled = true;
    };
  }
  release(streamId: string, onError: HighlightJob["onError"]) {
    this.cancelPending(streamId);
    this.queue.addItem({ canceled: false, onError, streamId });
  }
  dispose() {
    for (const job of this.queue.peekAllItems()) {
      job.canceled = true;
    }
    this.queue.stop();
    this.queue.clear();
    this.connection?.close(new Error("代码高亮调度器已关闭"));
  }
  private cancelPending(streamId: string) {
    for (const job of this.queue.peekPendingItems()) {
      if (job.streamId === streamId) {
        job.canceled = true;
      }
    }
  }
}
