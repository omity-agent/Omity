import type { AppHosts } from "../hosts";
import type { AppRegistry } from "../registry";
import { Logger } from "../../infrastructure/logging/logger";
import type { Server } from "node:http";
import type { Socket } from "node:net";
import { captureError } from "../../failures/details";
import { localize } from "../../i18n/server";
import pMap from "p-map";
import { promisify } from "node:util";

type ShutdownSignal = "SIGINT" | "SIGTERM";
type ShutdownReason = ShutdownSignal | "startup-failure";
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
export async function closeControllerResources(
  hosts: Pick<AppHosts, "close">,
  registry: Pick<AppRegistry, "close">,
  ...background: { close: () => Promise<void> }[]
) {
  await pMap([...background, hosts, registry], (resource) => resource.close(), {
    concurrency: 1,
    stopOnError: false,
  });
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
  logger.info(localize("application:shutdown.started"), { reason });
  await closeStep(
    logger,
    localize("application:shutdown.httpServer"),
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
  await closeStep(
    logger,
    localize("application:shutdown.hostResources"),
    () => resources.controller?.close(),
    failures,
  );
  await closeStep(
    logger,
    localize("application:shutdown.accessStore"),
    () => resources.access?.close(),
    failures,
  );
  await closeStep(
    logger,
    localize("application:shutdown.instanceLock"),
    resources.releaseLock,
    failures,
  );
  if (failures.length > 0) {
    logger.error(localize("application:shutdown.completedWithFailures"), {
      durationMs: Date.now() - startedAt,
      errorCount: failures.length,
      errors: failures.map(captureError),
    });
    throw new AggregateError(failures, localize("application:shutdown.failed"));
  }
  logger.info(localize("application:shutdown.completed"), {
    durationMs: Date.now() - startedAt,
  });
}
async function closeStep(
  logger: ShutdownLogger,
  name: string,
  close: () => unknown,
  failures: unknown[],
) {
  logger.info(localize("application:shutdown.stepStarted", { value0: name }));
  const startedAt = Date.now();
  try {
    await close();
    logger.info(localize("application:shutdown.stepCompleted", { value0: name }), {
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    failures.push(error);
    logger.error(localize("application:shutdown.stepFailed", { value0: name }), {
      durationMs: Date.now() - startedAt,
      error: captureError(error),
    });
  }
}
