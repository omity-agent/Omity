interface ToolExecutionHandle {
  signal: AbortSignal;
  cancellationDurationMs: () => number | undefined;
  complete: () => void;
}
interface ToolExecution {
  active: boolean;
  startedAt?: number;
  cancelledAt?: number;
  controller: AbortController;
  timer?: ReturnType<typeof setInterval>;
}
interface ToolExecutionsOptions {
  cancellationRequested?: (callId: string) => number | undefined;
  now?: () => number;
  pollMs?: number;
}
export class ToolExecutions {
  private readonly executions = new Map<string, ToolExecution>();
  private readonly now: () => number;
  constructor(private readonly options: ToolExecutionsOptions = {}) {
    this.now = options.now ?? Date.now;
  }
  announce(callId: string) {
    if (!this.executions.has(callId)) {
      this.executions.set(callId, this.createExecution());
    }
  }
  begin(callId: string, parentSignal?: AbortSignal): ToolExecutionHandle {
    const execution = this.executions.get(callId) ?? this.createExecution();
    if (execution.active) {
      throw new Error(`工具调用已在运行：${callId}`);
    }
    this.executions.set(callId, execution);
    execution.active = true;
    this.startPolling(callId, execution);
    if (execution.cancelledAt === undefined) {
      execution.startedAt = this.now();
    }
    const signal = parentSignal
      ? AbortSignal.any([parentSignal, execution.controller.signal])
      : execution.controller.signal;
    return {
      cancellationDurationMs: () =>
        execution.cancelledAt === undefined
          ? undefined
          : execution.startedAt === undefined
            ? 0
            : Math.max(0, execution.cancelledAt - execution.startedAt),
      complete: () => {
        if (execution.timer) {
          clearInterval(execution.timer);
        }
        if (this.executions.get(callId) === execution) {
          this.executions.delete(callId);
        }
      },
      signal,
    };
  }
  cancel(callId: string, requestedAt = this.now()) {
    const execution = this.executions.get(callId);
    if (!execution || execution.cancelledAt !== undefined) {
      return false;
    }
    execution.cancelledAt = requestedAt;
    execution.controller.abort(new Error("用户手动终止工具"));
    return true;
  }
  close() {
    for (const execution of this.executions.values()) {
      clearInterval(execution.timer);
    }
    this.executions.clear();
  }
  private createExecution(): ToolExecution {
    return {
      active: false,
      controller: new AbortController(),
    };
  }
  private startPolling(callId: string, execution: ToolExecution) {
    if (!this.options.cancellationRequested) {
      return;
    }
    const check = () => {
      const requestedAt = this.options.cancellationRequested?.(callId);
      if (requestedAt !== undefined) {
        this.cancel(callId, requestedAt);
      }
    };
    check();
    if (execution.cancelledAt !== undefined) {
      return;
    }
    execution.timer = setInterval(check, this.options.pollMs ?? 100);
    execution.timer.unref();
  }
}
