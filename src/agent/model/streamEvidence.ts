import { isPlainObject } from "es-toolkit";

export class StreamEvidence {
  private readonly startedAt = new Date().toISOString();
  private readonly started = performance.now();
  private openedAt?: number;
  private sentAt?: number;
  private firstMessageAt?: number;
  private lastMessageAt?: number;
  private messagesReceived = 0;
  private bytesReceived = 0;
  private lastEventType?: string;
  private responseId?: string;
  private lastItemId?: string;
  private lastOutputIndex?: number;
  private lastSequenceNumber?: number;
  elapsed(timestamp: number) {
    return Math.round(timestamp - this.started);
  }
  opened() {
    this.openedAt = performance.now();
  }
  sent() {
    this.sentAt = performance.now();
  }
  received(data: unknown) {
    const now = performance.now();
    this.messagesReceived += 1;
    if (typeof data === "string") {
      this.bytesReceived += Buffer.byteLength(data);
    }
    this.firstMessageAt ??= now;
    this.lastMessageAt = now;
  }
  event(message: Record<string, unknown>) {
    this.lastEventType = typeof message["type"] === "string" ? message["type"] : undefined;
    const { response } = message;
    if (isPlainObject(response) && typeof response["id"] === "string") {
      this.responseId = response["id"];
    }
    this.lastItemId = typeof message["item_id"] === "string" ? message["item_id"] : undefined;
    this.lastOutputIndex =
      typeof message["output_index"] === "number" ? message["output_index"] : undefined;
    this.lastSequenceNumber =
      typeof message["sequence_number"] === "number" ? message["sequence_number"] : undefined;
  }
  snapshot() {
    const now = performance.now(),
      elapsed = (timestamp?: number) =>
        timestamp === undefined ? undefined : this.elapsed(timestamp);
    return {
      stream: {
        bytesReceived: this.bytesReceived,
        lastEventType: this.lastEventType,
        lastItemId: this.lastItemId,
        lastOutputIndex: this.lastOutputIndex,
        lastSequenceNumber: this.lastSequenceNumber,
        messagesReceived: this.messagesReceived,
        responseId: this.responseId,
      },
      timing: {
        durationMs: Math.round(now - this.started),
        failedAt: new Date().toISOString(),
        firstMessageAfterMs: elapsed(this.firstMessageAt),
        handshakeDurationMs: elapsed(this.openedAt),
        lastMessageAgeMs:
          this.lastMessageAt === undefined ? undefined : Math.round(now - this.lastMessageAt),
        requestSentAfterMs: elapsed(this.sentAt),
        startedAt: this.startedAt,
      },
    };
  }
}
