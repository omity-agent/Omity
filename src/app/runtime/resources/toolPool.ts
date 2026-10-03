import {
  type LoadMcpOptions,
  type LoadedMcp,
  loadMcp,
  loadSessionMcp,
} from "../../../infrastructure/mcp/tools/catalog";
import {
  type SettingsContext,
  selectSettingsProfiles,
} from "../../../infrastructure/configuration/settings/context";
import type { AskUserRuntime } from "../../../infrastructure/toolbox/runtime";
import { AsyncResourceCache } from "../../../infrastructure/mcp/lifecycle";
import type { LogLevel } from "../../../types";
import { Logger } from "../../../infrastructure/logging/logger";
import type { McpToolSnapshot } from "../../../infrastructure/mcp/tools/definitions";

export function createAppMcp(
  root: string,
  level: LogLevel,
  context: SettingsContext,
  askUser: AskUserRuntime,
) {
  const options: LoadMcpOptions = {
      askUser: (request, sessionId, signal) => askUser.ask(request, sessionId, signal),
    },
    sessionOptions = (cwd = root, serverOverrides?: Record<string, boolean>): LoadMcpOptions => ({
      ...options,
      cwd,
      serverOverrides,
    });
  return new AppMcp(
    (profiles, cwd, serverOverrides) =>
      loadMcp(
        root,
        new Logger(level, true),
        selectSettingsProfiles(context, profiles),
        sessionOptions(cwd, serverOverrides),
      ),
    (profiles, snapshot, cwd) =>
      loadSessionMcp(
        new Logger(level, true),
        selectSettingsProfiles(context, profiles),
        snapshot,
        sessionOptions(cwd),
      ),
  );
}
export class AppMcp {
  private readonly resources = new AsyncResourceCache<LoadedMcp>("App");
  constructor(
    private readonly initialize: (
      profiles: string[],
      cwd?: string,
      serverOverrides?: Record<string, boolean>,
    ) => Promise<LoadedMcp>,
    private readonly initializeSnapshot: (
      profiles: string[],
      snapshot: McpToolSnapshot,
      cwd?: string,
    ) => Promise<LoadedMcp> = () => Promise.reject(new Error("App MCP 未配置会话快照加载器")),
  ) {}
  load(profiles: string[]) {
    return this.resources.load(JSON.stringify(profiles), () => this.initialize(profiles));
  }
  loadSession(sessionId: string, profiles: string[], snapshot: McpToolSnapshot, cwd: string) {
    return this.resources.load(`session:${sessionId}`, () =>
      this.initializeSnapshot(profiles, snapshot, cwd),
    );
  }
  createSession(
    sessionId: string,
    profiles: string[],
    cwd: string,
    serverOverrides?: Record<string, boolean>,
  ) {
    const key = `session:${sessionId}`;
    if (this.resources.has(key)) {
      throw new Error(`Session 已绑定 MCP：${sessionId}`);
    }
    return this.resources.load(key, () => this.initialize(profiles, cwd, serverOverrides));
  }
  discardSession(sessionId: string) {
    return this.resources.discard(`session:${sessionId}`);
  }
  close() {
    return this.resources.close();
  }
}
