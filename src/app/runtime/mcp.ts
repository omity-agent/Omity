import type { LoadedMcp } from "../../infrastructure/mcp/loadTools";

export class AppMcp {
  private closing = false;
  private closePromise?: Promise<void>;
  private readonly loading = new Map<string, Promise<LoadedMcp>>();
  constructor(private readonly initialize: (profiles: string[]) => Promise<LoadedMcp>) {}
  load(profiles: string[]) {
    if (this.closing) {
      return Promise.reject(new Error("App 正在关闭，不能初始化 MCP"));
    }
    const key = JSON.stringify(profiles);
    const existing = this.loading.get(key);
    if (existing) {
      return existing;
    }
    const loading = this.loadFresh(key, profiles);
    this.loading.set(key, loading);
    return loading;
  }
  close() {
    this.closePromise ??= this.closeLoaded();
    return this.closePromise;
  }
  private async closeLoaded() {
    this.closing = true;
    const loaded = await Promise.allSettled(this.loading.values());
    const closed = await Promise.allSettled(
      loaded.flatMap((result) => (result.status === "fulfilled" ? [result.value.close()] : [])),
    );
    const failures = [
      ...loaded.flatMap((result) => (result.status === "rejected" ? [result.reason] : [])),
      ...closed.flatMap((result) => (result.status === "rejected" ? [result.reason] : [])),
    ];
    if (failures.length > 0) {
      throw new AggregateError(failures, "关闭 App MCP 资源失败");
    }
  }
  private async loadFresh(key: string, profiles: string[]) {
    try {
      return await this.initialize(profiles);
    } catch (error) {
      this.loading.delete(key);
      throw error;
    }
  }
}
