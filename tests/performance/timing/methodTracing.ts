import { AgentDatabase } from "../../../src/infrastructure/database/agentDatabase";
import { AppController } from "../../../src/app/controller";
import { AppRegistry } from "../../../src/app/registry";
import { BunSqliteSaver } from "../../../src/checkpointer/saver";
import { Database } from "bun:sqlite";
import { FileLinkIndexer } from "../../../src/infrastructure/database/fileLinkIndexer";
import { FunctionTracing } from "./functionTracing";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { RestartingStdioClient } from "../../../src/infrastructure/mcp/client/restarting";
import type { SpanRecorder } from "./spanRecorder";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { StructuredTool } from "@langchain/core/tools";
import assert from "node:assert/strict";
import { createOpenAI } from "@ai-sdk/openai";

export class MethodTracing {
  private readonly restorations: (() => void)[] = [];
  private readonly statements = new WeakMap<object, object>();
  private readonly functions?: FunctionTracing;
  constructor(
    private readonly trace: SpanRecorder,
    model: string,
  ) {
    try {
      this.install(AppController.prototype, "publishChange", "会话状态刷新", (end) => {
        if (trace.boundaries.modelSettled === undefined) {
          trace.mark("modelSettled", end);
        }
      });
      this.install(AppRegistry.prototype, "refresh", "会话信息及标题查询");
      this.install(AppController.prototype, "eventCursor", "事件游标查询及连接管理");
      this.install(Bun, "gc", "强制 GC");
      this.install(Database.prototype, "close", "关闭 SQLite 连接");
      this.install(Database.prototype, "run", "SQLite 写入及事务");
      for (const method of ["prepare", "query"]) {
        this.install(Database.prototype, method, "SQLite 语句准备", undefined, (statement) =>
          this.wrapStatement(statement),
        );
      }
      this.install(AgentDatabase.prototype, "appendStream", "流事件落库");
      this.install(AgentDatabase.prototype, "syncHistory", "历史同步");
      this.install(FileLinkIndexer.prototype, "prepareSources", "文件链接索引准备");
      this.install(FileLinkIndexer.prototype, "prepareDelta", "增量文件链接索引");
      this.install(BunSqliteSaver.prototype, "getTuple", "读取检查点");
      this.install(BunSqliteSaver.prototype, "put", "保存完整检查点");
      this.install(BunSqliteSaver.prototype, "putWrites", "保存检查点增量");
      const serializer = requirePrototype(new MemorySaver().serde);
      this.install(serializer, "dumpsTyped", "检查点序列化");
      this.install(serializer, "loadsTyped", "检查点反序列化");
      this.install(StructuredTool.prototype, "invoke", "工具参数校验及结果封装");
      this.install(RestartingStdioClient.prototype, "invoke", "MCP 连接及调用管理");
      this.install(StdioClientTransport.prototype, "send", "JSON-RPC 编码及管道发送");
      this.install(StdioClientTransport.prototype, "processReadBuffer", "JSON-RPC 接收解析");
      const provider = createOpenAI({ apiKey: "local-benchmark-placeholder" });
      this.install(
        requirePrototype(provider.responses(model)),
        "doStream",
        "Responses 请求转换及编码",
      );
      this.functions = new FunctionTracing(trace);
    } catch (error) {
      this.restore();
      throw error;
    }
  }
  restore() {
    this.functions?.restore();
    for (const restore of this.restorations.splice(0).toReversed()) {
      restore();
    }
  }
  private install(
    target: object,
    method: string,
    label: string,
    after?: (end: number) => void,
    transform?: (result: unknown) => unknown,
  ) {
    const original: unknown = Reflect.get(target, method),
      descriptor = Object.getOwnPropertyDescriptor(target, method);
    assert(typeof original === "function", `性能计时挂接点不存在：${method}`);
    assert(descriptor === undefined || "value" in descriptor, `计时挂接点不是数据属性：${method}`);
    Object.defineProperty(target, method, {
      ...(descriptor ?? { configurable: true, writable: true }),
      value: new Proxy(original, {
        apply: (operation, receiver: unknown, args: unknown[]) =>
          this.trace.measure(
            label,
            () => {
              const result: unknown = Reflect.apply(operation, receiver, args);
              return transform ? transform(result) : result;
            },
            after,
          ),
      }),
    });
    this.restorations.push(() => {
      if (descriptor) {
        Object.defineProperty(target, method, descriptor);
      } else {
        assert(Reflect.deleteProperty(target, method), `无法恢复计时挂接点：${method}`);
      }
    });
  }
  private wrapStatement(statement: unknown): object {
    assert(statement !== null && typeof statement === "object", "SQLite 未返回 Statement");
    const existing = this.statements.get(statement);
    if (existing) {
      return existing;
    }
    const wrapped = new Proxy(statement, {
      get: (target, property) => {
        const value: unknown = Reflect.get(target, property, target);
        if (typeof value !== "function") {
          return value;
        }
        return (...args: unknown[]) => {
          const invoke = () => Reflect.apply(value, target, args);
          if (property === "all" || property === "get" || property === "values") {
            return this.trace.measure("SQLite 查询", invoke);
          }
          return property === "run" ? this.trace.measure("SQLite 写入及事务", invoke) : invoke();
        };
      },
    });
    this.statements.set(statement, wrapped);
    this.statements.set(wrapped, wrapped);
    return wrapped;
  }
}
function requirePrototype(value: object): object {
  const prototype: unknown = Object.getPrototypeOf(value);
  assert(prototype !== null && typeof prototype === "object", "性能计时目标缺少原型");
  return prototype;
}
