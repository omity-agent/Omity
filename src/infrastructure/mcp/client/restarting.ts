import { type ConnectedStdioClient, type StdioConnector, connectStdioClient } from "./stdio";
import {
  McpStdioProcessExitedError,
  McpStdioUnavailableError,
  type StdioRestartPolicy,
} from "./availability";
import { captureError, summarizeError } from "../../../failures/details";
import { interruptibleDelay, requestSignal, waitForSignal } from "./interruptible";
import type { Logger } from "../../logging/logger";
import type { StdioConnection } from "@langchain/mcp-adapters";

export class RestartingStdioClient {
  private readonly controller = new AbortController();
  private current?: ConnectedStdioClient;
  private lastFailure?: unknown;
  private recoveryIdentity?: object;
  private recovering?: Promise<ConnectedStdioClient>;
  private restartAttempts = 0;
  private unavailable?: McpStdioUnavailableError;
  private constructor(
    private readonly serverName: string,
    private readonly connection: StdioConnection,
    private readonly policy: StdioRestartPolicy,
    private readonly logger: Logger,
    private readonly connect: StdioConnector,
  ) {}
  static async create(
    serverName: string,
    connection: StdioConnection,
    policy: StdioRestartPolicy,
    logger: Logger,
    connect: StdioConnector = connectStdioClient,
  ) {
    const client = new RestartingStdioClient(serverName, connection, policy, logger, connect);
    client.install(await connect(serverName, connection, client.controller.signal));
    return client;
  }
  callTool = (...args: unknown[]) => this.invoke("callTool", args);
  listTools = (...args: unknown[]) => this.invoke("listTools", args);
  readResource = (...args: unknown[]) => this.invoke("readResource", args);
  async close() {
    this.controller.abort(new Error(`正在关闭 MCP stdio 服务器 "${this.serverName}"`));
    try {
      await this.recovering;
    } catch {
      if (!this.controller.signal.aborted) {
        throw new Error(`MCP stdio 服务器 "${this.serverName}" 关闭前恢复失败`);
      }
    }
    const { current } = this;
    this.current = undefined;
    await current?.close();
  }
  private async invoke(method: "callTool" | "listTools" | "readResource", args: unknown[]) {
    const signal = requestSignal(args);
    if (this.unavailable) {
      this.unavailable = undefined;
      this.restartAttempts = 0;
    }
    for (;;) {
      signal?.throwIfAborted();
      const connection = this.current ?? (await waitForSignal(this.ensureRecovery(), signal));
      try {
        const operation: unknown = connection.client[method];
        if (typeof operation !== "function") {
          throw new TypeError(`MCP 客户端缺少 ${method} 方法`);
        }
        const result: unknown = await Reflect.apply(operation, connection.client, args);
        this.restartAttempts = 0;
        this.lastFailure = undefined;
        return result;
      } catch (error) {
        if (signal?.aborted || !connection.isClosed()) {
          throw error;
        }
        this.recordClosure(connection, method, error);
        await waitForSignal(this.ensureRecovery(), signal);
      }
    }
  }
  private install(connection: ConnectedStdioClient) {
    this.current = connection;
    void this.observeClosure(connection);
  }
  private async observeClosure(connection: ConnectedStdioClient) {
    await connection.closed;
    try {
      await this.recovering;
    } catch {
      return;
    }
    if (this.controller.signal.aborted || this.current !== connection) {
      return;
    }
    this.recordClosure(connection);
    try {
      await this.ensureRecovery();
    } catch (error: unknown) {
      if (error instanceof McpStdioUnavailableError) {
        return;
      }
    }
  }
  private recordClosure(
    connection: ConnectedStdioClient,
    operation?: "callTool" | "listTools" | "readResource",
    cause?: unknown,
  ) {
    if (this.current === connection) {
      this.current = undefined;
    }
    this.lastFailure = new McpStdioProcessExitedError(
      connection.diagnostics() || undefined,
      operation,
      cause,
    );
  }
  private ensureRecovery() {
    if (this.controller.signal.aborted) {
      return Promise.reject(this.controller.signal.reason);
    }
    if (this.unavailable) {
      return Promise.reject(this.unavailable);
    }
    if (this.recovering) {
      return this.recovering;
    }
    const task = this.restart();
    const identity = {};
    const recovery = this.manageRecovery(task, identity);
    this.recoveryIdentity = identity;
    this.recovering = recovery;
    return recovery;
  }
  private async manageRecovery(task: Promise<ConnectedStdioClient>, identity: object) {
    try {
      return await task;
    } catch (error) {
      if (!(error instanceof McpStdioUnavailableError) && !this.controller.signal.aborted) {
        this.logger.error("MCP stdio 恢复任务失败", {
          error: error instanceof Error ? error.message : String(error),
          server: this.serverName,
        });
      }
      throw error;
    } finally {
      if (this.recoveryIdentity === identity) {
        this.recoveryIdentity = undefined;
        this.recovering = undefined;
      }
    }
  }
  private async restart() {
    while (this.restartAttempts < this.policy.maxAttempts) {
      if (this.restartAttempts > 0) {
        await interruptibleDelay(this.policy.delayMs, this.controller.signal);
      }
      this.controller.signal.throwIfAborted();
      const attempt = ++this.restartAttempts;
      try {
        const connection = await this.connect(
          this.serverName,
          this.connection,
          this.controller.signal,
        );
        this.install(connection);
        this.logger.info("MCP stdio 子进程已重启", { attempt, server: this.serverName });
        return connection;
      } catch (error) {
        if (this.controller.signal.aborted) {
          throw this.controller.signal.reason;
        }
        this.lastFailure = error;
        this.logger.warn("MCP stdio 子进程重启失败", {
          attempt,
          maximum: this.policy.maxAttempts,
          server: this.serverName,
        });
      }
    }
    this.unavailable = new McpStdioUnavailableError(
      this.serverName,
      this.policy.maxAttempts,
      this.lastFailure,
    );
    this.logger.error(this.unavailable.message, {
      lastFailure: summarizeError(captureError(this.lastFailure)),
    });
    throw this.unavailable;
  }
}
