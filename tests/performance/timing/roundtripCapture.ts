import { type Boundaries, SpanRecorder } from "./spanRecorder";
import { type PhaseTiming, summarizePhases } from "./phaseBreakdown";
import { measuredCallId, responseFrames } from "../responseFrames";
import { Client } from "@modelcontextprotocol/client";
import { MethodTracing } from "./methodTracing";
import assert from "node:assert/strict";
import { raceSignal } from "race-signal";
import { z } from "zod";

export interface RoundtripSample extends Boundaries {
  phases: PhaseTiming[];
  requestBytes: number;
}
const outputSchema = z.object({
  input: z.array(z.looseObject({ type: z.string().optional() })),
});
export class RoundtripCapture {
  private readonly release = Promise.withResolvers<void>();
  private readonly originalFetch = globalThis.fetch;
  private readonly originalCall: unknown = Reflect.get(Client.prototype, "callTool");
  private readonly trace = new SpanRecorder();
  private readonly tracing: MethodTracing;
  private requestBytes?: number;
  private requests = 0;
  private calls = 0;
  constructor(model: string, inputTokens: number) {
    const first = responseFrames(true, model, inputTokens),
      final = responseFrames(false, model, inputTokens);
    assert(typeof this.originalCall === "function", "MCP 客户端缺少 callTool 方法");
    this.tracing = new MethodTracing(this.trace, model);
    globalThis.fetch = Object.assign(
      async (url: string | URL | Request, init?: RequestInit) => {
        const address = url instanceof Request ? url.url : url.toString();
        assert.equal(
          address,
          "https://benchmark.invalid/v1/responses",
          "性能测试拒绝未预期的网络请求",
        );
        assert(typeof init?.body === "string", "模型请求必须为 JSON 文本");
        this.requests += 1;
        if (this.requests === 1) {
          await raceSignal(this.release.promise, init.signal);
          return this.response(first, true);
        }
        assert.equal(this.requests, 2, "模型不应重试或发起第三次请求");
        this.trace.mark("sent");
        const { body } = init,
          request = outputSchema.parse(JSON.parse(body) as unknown),
          result = request.input.filter(
            (item) => item["call_id"] === measuredCallId && item.type === "function_call_output",
          );
        assert.equal(result.length, 1, "下一次模型请求必须包含唯一的空工具结果");
        assert.equal(result[0]?.["output"], "", "空工具输出不应包含业务数据");
        this.requestBytes = Buffer.byteLength(body);
        return this.response(final, false);
      },
      { preconnect: this.originalFetch.preconnect },
    );
    Reflect.set(
      Client.prototype,
      "callTool",
      new Proxy(this.originalCall, {
        apply: async (target, receiver: unknown, args: unknown[]) => {
          assert.equal(
            z.object({ name: z.string() }).parse(args[0]).name,
            "noop0",
            "实际只能执行一个空工具",
          );
          this.calls += 1;
          assert.equal(this.calls, 1, "历史工具不应被重新执行");
          this.trace.mark("mcpStarted");
          const output: unknown = await this.trace.measure("MCP SDK 请求及结果校验", () =>
            Reflect.apply(target, receiver, args),
          );
          this.trace.mark("mcpReturned");
          const parsed = z
            .object({ content: z.array(z.unknown()), isError: z.boolean().optional() })
            .parse(output);
          assert.deepEqual(parsed.content, [], "MCP 必须返回空 content");
          assert.notEqual(parsed.isError, true, "空工具不应返回错误");
          return output;
        },
      }),
    );
  }
  start() {
    this.release.resolve();
  }
  get sent() {
    return this.trace.boundaries.sent !== undefined;
  }
  observeStatus(status: string) {
    if (
      status === "waiting" &&
      this.trace.active &&
      this.trace.boundaries.mcpReturned !== undefined &&
      this.trace.boundaries.nextModel === undefined
    ) {
      this.trace.mark("nextModel");
    }
  }
  result(): RoundtripSample {
    assert.equal(this.requests, 2);
    assert.equal(this.calls, 1);
    const boundaries = this.trace.complete();
    return {
      ...boundaries,
      phases: summarizePhases(boundaries, this.trace.spans),
      requestBytes: z.number().int().positive().parse(this.requestBytes),
    };
  }
  restore() {
    globalThis.fetch = this.originalFetch;
    Reflect.set(Client.prototype, "callTool", this.originalCall);
    this.tracing.restore();
    this.trace.dispose();
  }
  private response(bytes: Uint8Array, start: boolean) {
    return new Response(
      new ReadableStream({
        start: (controller) => {
          if (start) {
            this.trace.mark("received");
          }
          controller.enqueue(bytes);
          controller.close();
        },
      }),
      { headers: { "Content-Type": "text/event-stream" } },
    );
  }
}
