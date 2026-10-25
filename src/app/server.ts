import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo, Socket } from "node:net";

import { getRequestListener } from "@hono/node-server";

import { requestListenerOptions } from "../../settings/networking";
import { localize } from "../i18n/server";
import { applicationAssetPath } from "../infrastructure/applicationAssets";
import { createSettingsContext } from "../infrastructure/configuration/settings/context";
import { userDataDirectory } from "../infrastructure/configuration/settings/files";
import { loadSettings } from "../infrastructure/configuration/settings/load";
import { AccessService } from "./access/service";
import { AppController } from "./controller";
import { createApi } from "./http/handler";
import { createStaticApp } from "./http/static";
import { appUrl } from "./launch";
import { AppInstanceLock } from "./runtime/instanceLock";
import {
  closeAppResources,
  createShutdownLogger,
  listenForShutdownSignal,
} from "./runtime/shutdown";

interface AppServerOptions {
  root: string;
  host?: string;
  port?: number;
  onReady?: (url: string) => void;
}
export async function startAppServer(options: AppServerOptions) {
  const settingsContext = createSettingsContext(options.root),
    settings = loadSettings(options.root, { settingsContext }),
    host = options.host ?? settings.server.host,
    port = options.port ?? settings.server.port,
    lock = AppInstanceLock.acquire(userDataDirectory()),
    shutdown = listenForShutdownSignal();
  let access: AccessService | undefined,
    controller: AppController | undefined,
    server: ReturnType<typeof createServer> | undefined;
  const connections = new Set<Socket>();
  let failure: unknown, signal: Awaited<typeof shutdown.signal> | undefined;
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
    const staticRoot = applicationAssetPath(options.root, "dist/frontend", "frontend");
    server = createServer();
    server.on("connection", (socket) => {
      connections.add(socket);
      socket.once("close", () => {
        connections.delete(socket);
      });
    });
    const handleApi = getRequestListener(
        createApi(controller, access).fetch,
        requestListenerOptions,
      ),
      handleStatic = getRequestListener(createStaticApp(staticRoot).fetch, requestListenerOptions);
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
    throw new AggregateError(
      [failure, closeFailure],
      localize("application:server.startupAndShutdownFailed"),
    );
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
    throw new Error(localize("application:server.portUnavailable"));
  }
  return address.port;
}
