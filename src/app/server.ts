import type { AddressInfo, Socket } from "node:net";
import {
  closeAppResources,
  createShutdownLogger,
  listenForShutdownSignal,
} from "./runtime/shutdown";
import { AccessService } from "./access/service";
import { AppController } from "./controller";
import { AppInstanceLock } from "./runtime/instanceLock";
import { appUrl } from "./launch";
import { applicationAssetPath } from "../infrastructure/applicationAssets";
import { createApi } from "./http/handler";
import { createServer } from "node:http";
import { createSettingsContext } from "../infrastructure/configuration/settings/context";
import { createStaticApp } from "./http/static";
import { getRequestListener } from "@hono/node-server";
import { loadSettings } from "../infrastructure/configuration/settings/load";
import { once } from "node:events";
import { userDataDirectory } from "../infrastructure/configuration/settings/files";

export interface AppServerOptions {
  root: string;
  host?: string;
  port?: number;
  onReady?: (url: string) => void;
}
export async function startAppServer(options: AppServerOptions) {
  const settingsContext = createSettingsContext(options.root);
  const settings = loadSettings(options.root, { settingsContext });
  const host = options.host ?? settings.server.host;
  const port = options.port ?? settings.server.port;
  const lock = AppInstanceLock.acquire(userDataDirectory());
  const shutdown = listenForShutdownSignal();
  let access: AccessService | undefined;
  let controller: AppController | undefined;
  let server: ReturnType<typeof createServer> | undefined;
  const connections = new Set<Socket>();
  let failure: unknown;
  let signal: Awaited<typeof shutdown.signal> | undefined;
  try {
    access = new AccessService(settings);
    controller = new AppController(options.root, {
      abandonedOwner: lock.abandonedOwner,
      owner: {
        instanceId: lock.owner.token,
        kind: "app",
        pid: lock.owner.pid,
      },
      settingsContext,
    });
    const staticRoot = applicationAssetPath(options.root, "src/app/frontend/dist", "dist");
    server = createServer();
    server.on("connection", (socket) => {
      connections.add(socket);
      socket.once("close", () => {
        connections.delete(socket);
      });
    });
    const handleApi = getRequestListener(createApi(controller, access).fetch);
    const handleStatic = getRequestListener(createStaticApp(staticRoot).fetch);
    server.on(
      "request",
      (req, res) =>
        void (req.url?.startsWith("/api") ? handleApi(req, res) : handleStatic(req, res)),
    );
    const listening = once(server, "listening");
    server.listen(port, host);
    await listening;
    const url = appUrl(host, listeningPort(server.address()));
    options.onReady?.(url);
    signal = await shutdown.signal;
  } catch (error) {
    failure = error;
  } finally {
    shutdown.dispose();
  }
  const logger = createShutdownLogger();
  let closeFailure: unknown;
  try {
    await closeAppResources(
      {
        access,
        controller,
        releaseLock: () => lock.release(),
        server: server ? { connections, instance: server } : undefined,
      },
      logger,
      signal ?? "startup-failure",
    );
  } catch (error) {
    closeFailure = error;
  }
  if (failure && closeFailure) {
    throw new AggregateError([failure, closeFailure], "服务端启动和关闭均失败");
  }
  if (failure) {
    throw failure;
  }
  if (closeFailure) {
    throw closeFailure;
  }
}
function listeningPort(address: string | AddressInfo | null) {
  if (!address || typeof address === "string") {
    throw new Error("无法获取 WebUI 监听端口");
  }
  return address.port;
}
