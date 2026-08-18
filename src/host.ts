import { loadMcp, loadMcpSnapshot } from "./infrastructure/mcp/loadTools";
import { HookRuntime } from "./hooks/runtime";
import { HostLease } from "./runtime/execution/lease";
import type { HostMode } from "./types";
import type { HostRunOptions } from "./runtime/execution/hostOptions";
import { Logger } from "./infrastructure/logging/logger";
import { ToolExecutions } from "./agent/toolExecutions";
import { buildGraph } from "./agent";
import { createSessionDefinition } from "./infrastructure/database/sessionDefinition";
import { hostLoop } from "./runtime/loop";
import { prepareHostSession } from "./runtime/execution/sessionPreparation";
import { removeDatabaseDirectory } from "./infrastructure/database/connection";
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
      definition,
      paths,
      profiles,
      settings: loadedSettings,
      settingsContext,
      workspace,
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
  let lease: HostLease | undefined,
    ownedMcp: Awaited<ReturnType<typeof loadMcp>> | undefined,
    sessionCreated = definition !== undefined;
  const unwireSignals = wireHostSignals({
    enabled: options.wireSigint ?? false,
    force: controller,
    logger,
    stopping: stoppingController,
    timeoutMs: settings.host.shutdownTimeoutMs,
  });
  try {
    if (definition) {
      lease = createLease();
    }
    const session = { cwd: workspace, session: paths.dir },
      mcp = definition
        ? options.mcp
          ? await options.mcp(mode.sessionId, definition)
          : (ownedMcp = await loadMcpSnapshot(logger, definition.mcp))
        : (ownedMcp = await loadMcp(root, logger, settingsContext)),
      frozenDefinition =
        definition ?? createSessionDefinition(settings.agent.systemPrompt, mcp, session);
    if (!definition) {
      db.createSession(mode.sessionId, workspace, profiles, frozenDefinition);
      sessionCreated = true;
      lease = createLease();
    }
    db.onChange((event) => options.observer?.transcript?.(mode.sessionId, event));
    logSessionOpened();
    const tools = mcp.modelTools(session),
      hooks = new HookRuntime(
        settings.hooks,
        tools,
        db.db,
        logger,
        mode.sessionId,
        workspace,
        paths.dir,
        mcp.freeformToolParameters,
      ),
      { checkpointer, graph } = buildGraph(
        settings,
        tools,
        frozenDefinition.mcp.tools,
        db.db,
        hooks,
        {
          freeformToolParameters: mcp.freeformToolParameters,
          toolExecutions,
        },
      );
    options.onReady?.({
      cancelTool: (callId) => toolExecutions.cancel(callId),
    });
    await hostLoop({
      assertLease: () => {
        requireLease().assertOwned();
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
    requireLease().assertOwned();
  } finally {
    unwireSignals();
    try {
      await ownedMcp?.close();
    } finally {
      try {
        lease?.close();
      } finally {
        try {
          db.close();
        } finally {
          if (!sessionCreated && mode.kind !== "load") {
            removeDatabaseDirectory(paths.dir);
          }
        }
      }
    }
  }
  function createLease() {
    return new HostLease(
      db,
      logger,
      mode.sessionId,
      controller,
      settings.leases.hostTtlMs,
      options.owner,
    );
  }
  function requireLease() {
    if (!lease) {
      throw new Error(`Host Lease 尚未建立：${mode.sessionId}`);
    }
    return lease;
  }
  function logSessionOpened() {
    const action = mode.kind === "new" ? "创建" : mode.kind === "load" ? "加载" : "覆盖";
    logger.info(`已${action}会话`, { db: paths.dbPath, sessionId: mode.sessionId });
  }
}
