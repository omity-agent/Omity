import { decode, encodingExists } from "iconv-lite";
import { detect } from "chardet";
import { isUtf8 } from "node:buffer";

export class ProcessOutputCapture {
  private bytes = Buffer.alloc(0);
  private discardedBytes = 0;
  constructor(private readonly maximum: number) {}
  append(value: unknown) {
    const incoming = toBuffer(value),
      combined = Buffer.concat([this.bytes, incoming]);
    if (combined.length > this.maximum) {
      this.discardedBytes += combined.length - this.maximum;
      this.bytes = Buffer.from(combined.subarray(combined.length - this.maximum));
      return;
    }
    this.bytes = combined;
  }
  text() {
    if (this.bytes.length === 0) {
      return "";
    }
    const utf8 = this.discardedBytes > 0 ? withoutLeadingContinuationBytes(this.bytes) : this.bytes,
      value = isUtf8(utf8) ? utf8.toString("utf8").trim() : decodeDetected(this.bytes).trim();
    if (!value) {
      return "";
    }
    return this.discardedBytes > 0 ? `[前部输出已截断]\n${value}` : value;
  }
  snapshot() {
    return {
      capturedBytes: this.bytes.length,
      discardedBytes: this.discardedBytes,
      text: this.text(),
    };
  }
}
function decodeDetected(bytes: Buffer) {
  const encoding = detect(bytes);
  if (encoding === null) {
    return `[stderr 编码无法识别；原始字节（hex）]\n${bytes.toString("hex")}`;
  }
  if (!encodingExists(encoding)) {
    return `[stderr 编码不受支持：${String(encoding)}；原始字节（hex）]\n${bytes.toString("hex")}`;
  }
  return decode(bytes, encoding);
}
function withoutLeadingContinuationBytes(bytes: Buffer) {
  let offset = 0;
  while (offset < Math.min(bytes.length, 3) && (bytes[offset]! & 192) === 128) {
    offset += 1;
  }
  return bytes.subarray(offset);
}
function toBuffer(value: unknown) {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  return Buffer.from(typeof value === "string" ? value : String(value));
}
