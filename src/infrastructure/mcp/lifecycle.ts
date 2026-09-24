import { once } from "es-toolkit";
import pMap from "p-map";

interface Closeable {
  close: () => Promise<void>;
}
export class AsyncResourceCache<Resource extends Closeable> {
  private closed = false;
  private readonly loading = new Map<string, Promise<Resource>>();
  private readonly releasing = new Set<Promise<void>>();
  private readonly released = new WeakMap<Resource, Promise<void>>();
  constructor(private readonly name: string) {}
  has(key: string) {
    return this.loading.has(key);
  }
  load(key: string, initialize: () => Promise<Resource>) {
    if (this.closed) {
      return Promise.reject(new Error(`${this.name} 正在关闭，不能初始化资源`));
    }
    const existing = this.loading.get(key);
    if (existing) {
      return existing;
    }
    const pending = Promise.withResolvers<Resource>();
    this.loading.set(key, pending.promise);
    void (async () => {
      try {
        pending.resolve(await initialize());
      } catch (error) {
        if (this.loading.get(key) === pending.promise) {
          this.loading.delete(key);
        }
        pending.reject(error);
      }
    })();
    return pending.promise;
  }
  discard(key: string) {
    const loading = this.loading.get(key);
    this.loading.delete(key);
    return loading ? this.release(loading) : Promise.resolve();
  }
  close = once(async () => {
    this.closed = true;
    const pending = [
      ...this.releasing,
      ...Array.from(this.loading.values(), (loading) => this.release(loading)),
    ];
    this.loading.clear();
    try {
      await pMap(pending, () => undefined, { stopOnError: false });
    } catch (error) {
      if (error instanceof AggregateError) {
        error.message = `关闭 ${this.name} 资源失败`;
      }
      throw error;
    }
  });
  private release(loading: Promise<Resource>) {
    const holder = { promise: Promise.resolve() };
    const pending = (async () => {
      try {
        const resource = await loading;
        let released = this.released.get(resource);
        if (!released) {
          released = Promise.try(() => resource.close());
          this.released.set(resource, released);
        }
        await released;
      } finally {
        this.releasing.delete(holder.promise);
      }
    })();
    holder.promise = pending;
    this.releasing.add(pending);
    return pending;
  }
}
export async function cleanupFailedInitialization(
  failure: unknown,
  cleanup: () => unknown,
): Promise<never> {
  try {
    await cleanup();
  } catch (error) {
    throw new AggregateError([failure, error], "资源初始化及清理均失败", { cause: error });
  }
  throw failure;
}
