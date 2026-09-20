/* oxlint-disable import/no-namespace -- spyOn 持有模块命名空间才能替换并恢复实际 ESM 导出。 */
import * as aiMessages from "../../../src/agent/aiMessages";
import * as fileSources from "../../../src/fileLinks/messageSources";
import * as historySync from "../../../src/infrastructure/database/records/messages/sync";
import * as incomingMessages from "../../../src/agent/fromAiMessages";
import * as largeOutput from "../../../src/runtime/largeOutput";
import * as modelProvider from "../../../src/agent/model/provider";
import * as modelRequests from "../../../src/agent/model/request";
import * as streamEvents from "../../../src/runtime/aiStream";
import * as tokenizer from "../../../src/runtime/tokenizer";
import type { SpanRecorder } from "./spanRecorder";
import { spyOn } from "bun:test";

export class FunctionTracing {
  private readonly restorations: { mockRestore: () => void }[] = [];
  constructor(private readonly trace: SpanRecorder) {
    const originals = {
      buildModel: modelProvider.buildAiModel,
      countTokens: tokenizer.countTokens,
      fileSources: fileSources.messageFileLinkSources,
      fromModel: incomingMessages.fromModelMessages,
      options: modelProvider.aiRequestOptions,
      output: largeOutput.redirectLargeToolOutput,
      request: modelRequests.streamAiModel,
      stream: streamEvents.recordAiStreamPart,
      sync: historySync.prepareMessageSync,
      toModel: aiMessages.toModelMessages,
      toolStarted: streamEvents.recordToolStarted,
    };
    try {
      const probes = [
        () =>
          spyOn(aiMessages, "toModelMessages").mockImplementation(
            this.wrap(originals.toModel, "历史转换为模型消息"),
          ),
        () =>
          spyOn(incomingMessages, "fromModelMessages").mockImplementation(
            this.wrap(originals.fromModel, "模型响应转换为会话消息"),
          ),
        () =>
          spyOn(streamEvents, "recordAiStreamPart").mockImplementation(
            this.wrap(originals.stream, "模型流收尾及事件处理"),
          ),
        () =>
          spyOn(streamEvents, "recordToolStarted").mockImplementation(
            this.wrap(originals.toolStarted, "工具启动状态记录"),
          ),
        () =>
          spyOn(historySync, "prepareMessageSync").mockImplementation((...args) => {
            const prepared = this.wrap(originals.sync, "历史序列化及差异比较")(...args);
            return { ...prepared, commit: this.wrap(prepared.commit, "历史差异落库") };
          }),
        () =>
          spyOn(fileSources, "messageFileLinkSources").mockImplementation(
            this.wrap(originals.fileSources, "提取消息文件链接文本"),
          ),
        () =>
          spyOn(largeOutput, "redirectLargeToolOutput").mockImplementation(
            this.wrap(originals.output, "工具输出规范化及长度检查"),
          ),
        () =>
          spyOn(tokenizer, "countTokens").mockImplementation(
            this.wrap(originals.countTokens, "工具输出 Token 统计"),
          ),
        () =>
          spyOn(modelProvider, "aiRequestOptions").mockImplementation(
            this.wrap(originals.options, "构造模型请求选项"),
          ),
        () =>
          spyOn(modelProvider, "buildAiModel").mockImplementation(
            this.wrap(originals.buildModel, "创建模型适配器"),
          ),
        () =>
          spyOn(modelRequests, "streamAiModel").mockImplementation(
            this.wrap(originals.request, "模型请求准备及 SDK 调度"),
          ),
      ];
      for (const probe of probes) {
        this.restorations.push(probe());
      }
    } catch (error) {
      this.restore();
      throw error;
    }
  }
  restore() {
    for (const restoration of this.restorations.splice(0).toReversed()) {
      restoration.mockRestore();
    }
  }
  private wrap<Args extends unknown[], Result>(
    original: (...args: Args) => Result,
    label: string,
  ): (...args: Args) => Result {
    return (...args) => this.trace.measure(label, () => original(...args));
  }
}
