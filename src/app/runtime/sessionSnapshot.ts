import {
  type SettingsContext,
  prioritizeSettingsProfile,
  settingsProfileNames,
} from "../../infrastructure/configuration/settings/context";
import type { AppMcp } from "./resources/toolPool";
import type { SessionSubmission } from "../attachments/contract";
import { cleanupFailedInitialization } from "../../infrastructure/mcp/lifecycle";
import { createAppSession } from "./sessionActions";
import { createSessionDefinition } from "../../infrastructure/database/sessionDefinition";
import { loadConfiguredHookRules } from "../../infrastructure/configuration/hookRules";
import { loadSettings } from "../../infrastructure/configuration/settings/load";
import { resolveSessionPaths } from "../../infrastructure/configuration/sessionPaths";

export function sessionHookOptions(context: SettingsContext, profile?: string) {
  return loadConfiguredHookRules(prioritizeSettingsProfile(context, profile)).map(
    ({ id, enable, description }) => ({ description, enable: enable ?? true, id }),
  );
}
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
          hookOverrides: options.submission.hookOverrides,
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
    return cleanupFailedInitialization(error, () =>
      reservedSessionId ? options.mcp.discardSession(reservedSessionId) : undefined,
    );
  }
}
async function captureSessionSnapshot(options: {
  hookOverrides?: Record<string, boolean>;
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
    mcp = await options.mcp.createSession(options.sessionId, options.profiles, options.workspace),
    definition = createSessionDefinition(
      settings,
      mcp,
      {
        cwd: options.workspace,
        session: resolveSessionPaths(options.sessionId).dir,
      },
      options.hookOverrides,
    );
  return { definition, settings };
}
