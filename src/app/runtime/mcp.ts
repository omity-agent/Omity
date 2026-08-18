import {
  type LoadMcpOptions,
  type LoadedMcp,
  loadMcp,
  loadMcpSnapshot,
} from "../../infrastructure/mcp/loadTools";
import {
  type SettingsContext,
  selectSettingsProfiles,
} from "../../infrastructure/configuration/settings/context";
import type { AskUserRuntime } from "../../infrastructure/toolbox/runtime";
import type { LogLevel } from "../../types";
import { Logger } from "../../infrastructure/logging/logger";
import type { McpSnapshot } from "../../infrastructure/mcp/snapshot";

export function createAppMcp(
  root: string,
  level: LogLevel,
  context: SettingsContext,
  askUser: AskUserRuntime,
) {
  const options: LoadMcpOptions = {
    askUser: (request, sessionId, signal) => askUser.ask(request, sessionId, signal),
  };
  return new AppMcp(
    (profiles) =>
      loadMcp(root, new Logger(level, true), selectSettingsProfiles(context, profiles), options),
    (snapshot) => loadMcpSnapshot(new Logger(level, true), snapshot, options),
  );
}
export class AppMcp {
  private closing = false;
  private closePromise?: Promise<void>;
  private readonly loading = new Map<string, Promise<LoadedMcp>>();
  constructor(
    private readonly initialize: (profiles: string[]) => Promise<LoadedMcp>,
    private readonly initializeSnapshot: (snapshot: McpSnapshot) => Promise<LoadedMcp> = () =>
      Promise.reject(new Error("App MCP 未配置会话快照加载器")),
  ) {}
  load(profiles: string[]) {
    if (this.closing) {
      return Promise.reject(new Error("App 正在关闭，不能初始化 MCP"));
    }
    const key = JSON.stringify(profiles),
      existing = this.loading.get(key);
    if (existing) {
      return existing;
    }
    const loading = this.loadFresh(key, () => this.initialize(profiles));
    this.loading.set(key, loading);
    return loading;
  }
  loadSession(sessionId: string, snapshot: McpSnapshot) {
    if (this.closing) {
      return Promise.reject(new Error("App 正在关闭，不能初始化 MCP"));
    }
    const key = `session:${sessionId}`,
      existing = this.loading.get(key);
    if (existing) {
      return existing;
    }
    const loading = this.loadFresh(key, () => this.initializeSnapshot(snapshot));
    this.loading.set(key, loading);
    return loading;
  }
  createSession(sessionId: string, profiles: string[]) {
    if (this.closing) {
      return Promise.reject(new Error("App 正在关闭，不能初始化 MCP"));
    }
    const key = `session:${sessionId}`;
    if (this.loading.has(key)) {
      throw new Error(`Session 已绑定 MCP：${sessionId}`);
    }
    const loading = this.loadFresh(key, () => this.initialize(profiles));
    this.loading.set(key, loading);
    return loading;
  }
  async discardSession(sessionId: string) {
    const key = `session:${sessionId}`,
      loading = this.loading.get(key);
    if (!loading) {
      return;
    }
    this.loading.delete(key);
    const loaded = await loading;
    await loaded.close();
  }
  close() {
    this.closePromise ??= this.closeLoaded();
    return this.closePromise;
  }
  private async closeLoaded() {
    this.closing = true;
    const loaded = await Promise.allSettled(this.loading.values()),
      closed = await Promise.allSettled(
        [
          ...new Set(
            loaded.flatMap((result) => (result.status === "fulfilled" ? [result.value] : [])),
          ),
        ].map((value) => value.close()),
      ),
      failures = [
        ...loaded.flatMap((result) => (result.status === "rejected" ? [result.reason] : [])),
        ...closed.flatMap((result) => (result.status === "rejected" ? [result.reason] : [])),
      ];
    if (failures.length > 0) {
      throw new AggregateError(failures, "关闭 App MCP 资源失败");
    }
  }
  private async loadFresh(key: string, initialize: () => Promise<LoadedMcp>) {
    try {
      return await initialize();
    } catch (error) {
      this.loading.delete(key);
      throw error;
    }
  }
}
