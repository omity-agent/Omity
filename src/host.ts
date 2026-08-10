import { HookRuntime } from "./hooks/runtime";
import { HostLease } from "./runtime/execution/lease";
import type { HostMode } from "./types";
import type { HostRunOptions } from "./runtime/execution/hostOptions";
import { Logger } from "./infrastructure/logging/logger";
import { ToolExecutions } from "./agent/toolExecutions";
import { buildGraph } from "./agent";
import { hostLoop } from "./runtime/loop";
import { loadMcp } from "./infrastructure/mcp/loadTools";
import { prepareHostSession } from "./runtime/execution/sessionPreparation";
import { wireHostSignals } from "./runtime/execution/signals";

export async function runHost(mode: HostMode, root = process.cwd(), options: HostRunOptions = {}) {
  await runHostSession(mode, root, {
    ...options,
    recoverInterrupted: options.recoverInterrupted ?? mode.kind === "load",
    wireSigint: options.wireSigint ?? true,
  });
}
export async function runHostSession(
  mode: HostMode,
  root = process.cwd(),
  options: HostRunOptions = {},
) {
  const {
      db,
      paths,
      profiles,
      settings: loadedSettings,
      settingsContext,
    } = prepareHostSession(mode, root, options),
    settings = options.quiet
      ? {
          ...loadedSettings,
          logging: { ...loadedSettings.logging, streamTokens: false },
        }
      : loadedSettings,
    logger = new Logger(settings.logging.level, options.quiet ?? false),
    controller = options.controller ?? new AbortController(),
    stoppingController = options.stoppingController ?? new AbortController(),
    toolExecutions = new ToolExecutions({
      cancellationRequested: (callId) => db.takeToolCancellation(mode.sessionId, callId),
      pollMs: settings.host.pollMs,
    });
  let lease: HostLease;
  try {
    lease = new HostLease(
      db,
      logger,
      mode.sessionId,
      controller,
      settings.leases.hostTtlMs,
      options.owner,
    );
  } catch (error) {
    db.close();
    throw error;
  }
  db.onChange((event) => options.observer?.transcript?.(mode.sessionId, event));
  if (mode.kind === "new") {
    logger.info("已创建新会话", {
      db: paths.dbPath,
      sessionId: mode.sessionId,
    });
  } else if (mode.kind === "load") {
    logger.info("已加载会话", { db: paths.dbPath, sessionId: mode.sessionId });
  } else {
    logger.info("已覆盖会话", { db: paths.dbPath, sessionId: mode.sessionId });
  }
  let ownedMcp: Awaited<ReturnType<typeof loadMcp>> | undefined;
  const unwireSignals = wireHostSignals({
    enabled: options.wireSigint ?? false,
    force: controller,
    logger,
    stopping: stoppingController,
    timeoutMs: settings.host.shutdownTimeoutMs,
  });
  try {
    const mcp = options.mcp
        ? await options.mcp(profiles)
        : (ownedMcp = await loadMcp(root, logger, settingsContext)),
      tools = mcp.modelTools({
        cwd: db.workspace(mode.sessionId),
        session: paths.dir,
      }),
      hooks = new HookRuntime(
        settings.hooks,
        tools,
        db.db,
        logger,
        mode.sessionId,
        db.workspace(mode.sessionId),
        paths.dir,
        mcp.freeformToolParameters,
      ),
      { checkpointer, graph } = buildGraph(settings, tools, db.db, hooks, {
        freeformToolParameters: mcp.freeformToolParameters,
        toolExecutions,
      });
    options.onReady?.({
      cancelTool: (callId) => toolExecutions.cancel(callId),
    });
    await hostLoop({
      assertLease: () => {
        lease.assertOwned();
      },
      checkpointer,
      controller,
      db,
      graph,
      logger,
      observer: options.observer,
      sessionId: mode.sessionId,
      settings,
      stopping: stoppingController.signal,
      toolExecutions,
      wake: options.wake,
    });
    lease.assertOwned();
  } finally {
    unwireSignals();
    try {
      await ownedMcp?.close();
    } finally {
      try {
        lease.close();
      } finally {
        db.close();
      }
    }
  }
}
