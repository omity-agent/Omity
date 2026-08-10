import { Logger } from "../../infrastructure/logging/logger";
import type { Server } from "node:http";
import type { Socket } from "node:net";
import { captureError } from "../../failures/details";
import { promisify } from "node:util";

export type ShutdownSignal = "SIGINT" | "SIGTERM";
export type ShutdownReason = ShutdownSignal | "startup-failure";
interface ShutdownHttpServer {
  connections: ReadonlySet<Socket>;
  instance: Server;
}
interface ShutdownResources {
  access?: { close: () => void };
  controller?: { close: () => Promise<void> };
  releaseLock: () => void;
  server?: ShutdownHttpServer;
}
interface ShutdownLogger {
  error: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
}
export function createShutdownLogger() {
  return new Logger("debug");
}
export function listenForShutdownSignal() {
  const waiting = Promise.withResolvers<ShutdownSignal>(),
    onSigint = () => finish("SIGINT"),
    onSigterm = () => finish("SIGTERM"),
    removeListeners = () => {
      process.removeListener("SIGINT", onSigint);
      process.removeListener("SIGTERM", onSigterm);
    },
    finish = (signal: ShutdownSignal) => {
      removeListeners();
      waiting.resolve(signal);
    };
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);
  return {
    dispose: removeListeners,
    signal: waiting.promise,
  };
}
export async function closeAppResources(
  resources: ShutdownResources,
  logger: ShutdownLogger,
  reason: ShutdownReason,
) {
  const startedAt = Date.now(),
    failures: unknown[] = [];
  logger.info("服务端进入关闭流程", { reason });
  await closeStep(
    logger,
    "HTTP 服务",
    async () => {
      if (!resources.server?.instance.listening) {
        return;
      }
      const close = promisify(resources.server.instance.close.bind(resources.server.instance)),
        closed = close();
      for (const connection of resources.server.connections) {
        connection.destroy();
      }
      await closed;
    },
    failures,
  );
  await closeStep(logger, "会话 Host 与 MCP 资源", () => resources.controller?.close(), failures);
  await closeStep(logger, "访问控制存储", () => resources.access?.close(), failures);
  await closeStep(logger, "应用实例锁", resources.releaseLock, failures);
  if (failures.length > 0) {
    logger.error("服务端关闭流程完成，但存在失败步骤", {
      durationMs: Date.now() - startedAt,
      errorCount: failures.length,
      errors: failures.map(captureError),
    });
    throw new AggregateError(failures, "服务端关闭流程失败");
  }
  logger.info("服务端关闭完成", { durationMs: Date.now() - startedAt });
}
async function closeStep(
  logger: ShutdownLogger,
  name: string,
  close: () => unknown,
  failures: unknown[],
) {
  logger.info(`关闭步骤开始：${name}`);
  const startedAt = Date.now();
  try {
    await close();
    logger.info(`关闭步骤完成：${name}`, { durationMs: Date.now() - startedAt });
  } catch (error) {
    failures.push(error);
    logger.error(`关闭步骤失败：${name}`, {
      durationMs: Date.now() - startedAt,
      error: captureError(error),
    });
  }
}
