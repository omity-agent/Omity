import {
  type SettingsContext,
  prioritizeSettingsProfile,
  settingsProfileNames,
} from "../../infrastructure/configuration/settings/context";
import type { AppMcp } from "./mcp";
import type { SessionSubmission } from "../attachments/contract";
import { createAppSession } from "./sessionActions";
import { createSessionDefinition } from "../../infrastructure/database/sessionDefinition";
import { loadSettings } from "../../infrastructure/configuration/settings/load";
import { resolveSessionPaths } from "../../infrastructure/configuration/sessionPaths";

export async function createSnapshotSession(options: {
  baseContext: SettingsContext;
  mcp: AppMcp;
  root: string;
  submission: SessionSubmission;
}) {
  const settingsContext = prioritizeSettingsProfile(
      options.baseContext,
      options.submission.profile,
    ),
    profiles = settingsProfileNames(settingsContext);
  let reservedSessionId: string | undefined;
  try {
    return await createAppSession(
      options.root,
      options.submission,
      profiles,
      (sessionId, workspace) => {
        reservedSessionId = sessionId;
        return captureSessionSnapshot({
          mcp: options.mcp,
          profiles,
          root: options.root,
          sessionId,
          settingsContext,
          workspace,
        });
      },
    );
  } catch (error) {
    await discardFailedSession(options.mcp, reservedSessionId, error);
    throw error;
  }
}
async function discardFailedSession(mcp: AppMcp, sessionId: string | undefined, failure: unknown) {
  if (!sessionId) {
    return;
  }
  const [cleanup] = await Promise.allSettled([mcp.discardSession(sessionId)]);
  if (cleanup.status === "rejected") {
    throw new AggregateError([failure, cleanup.reason], "创建 Session 及清理 MCP 均失败");
  }
}
async function captureSessionSnapshot(options: {
  mcp: AppMcp;
  profiles: string[];
  root: string;
  sessionId: string;
  settingsContext: SettingsContext;
  workspace: string;
}) {
  const settings = loadSettings(options.root, {
      cwd: options.workspace,
      sessionId: options.sessionId,
      settingsContext: options.settingsContext,
    }),
    mcp = await options.mcp.createSession(options.sessionId, options.profiles),
    definition = createSessionDefinition(settings.agent.systemPrompt, mcp, {
      cwd: options.workspace,
      session: resolveSessionPaths(options.sessionId).dir,
    });
  return { definition, settings };
}
