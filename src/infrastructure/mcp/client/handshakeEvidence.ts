import { maximumMcpTransportErrors } from "../../../../settings/diagnosticPolicy";

export class HandshakeEvidence {
  private active = true;
  private readonly started = performance.now();
  private readonly errors: Error[] = [];
  private discarded = 0;
  isRecording() {
    return this.active;
  }
  record(error: Error) {
    if (!this.active || this.errors.includes(error)) {
      return;
    }
    if (this.errors.length < maximumMcpTransportErrors) {
      this.errors.push(error);
    } else {
      this.discarded += 1;
    }
  }
  stop() {
    this.active = false;
  }
  spawnFailed() {
    return this.errors.some((failure) => {
      const syscall: unknown = Reflect.get(failure, "syscall");
      return typeof syscall === "string" && syscall.startsWith("spawn");
    });
  }
  snapshot() {
    return {
      durationMs: performance.now() - this.started,
      transportErrors: [...this.errors],
      transportErrorsDiscarded: this.discarded,
    };
  }
}
