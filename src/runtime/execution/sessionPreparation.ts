import {
  createSettingsContext,
  prioritizeSettingsProfile,
  selectSettingsProfiles,
  settingsProfileNames,
} from "../../infrastructure/configuration/settings/context";
import { resolveSessionPaths, sessionPaths } from "../../infrastructure/configuration/sessionPaths";
import { sessionConflict, sessionNotFound } from "../../errors";
import { AgentDatabase } from "../../infrastructure/database/agentDatabase";
import type { HostMode } from "../../types";
import type { HostRunOptions } from "./hostOptions";
import { existsSync } from "node:fs";
import { loadSettings } from "../../infrastructure/configuration/settings/load";
import { normalizeWorkspacePath } from "../../infrastructure/configuration/workspacePath";
import { recoverHostSession } from "./recovery";
import { removeDatabaseDirectory } from "../../infrastructure/database/connection";

export function prepareHostSession(
  mode: HostMode,
  root: string,
  options: Pick<HostRunOptions, "cwd" | "recoverInterrupted" | "settingsContext">,
) {
  const workspace = normalizeWorkspacePath(options.cwd ?? root, root);
  const baseContext = options.settingsContext ?? createSettingsContext(root);
  if (mode.kind === "load") {
    const paths = resolveSessionPaths(mode.sessionId);
    const db = openLoadedDatabase(paths.dbPath, mode, options.recoverInterrupted ?? false);
    try {
      const profiles = db.profiles(mode.sessionId);
      const settingsContext = selectSettingsProfiles(baseContext, profiles);
      const settings = loadSettings(root, {
        cwd: workspace,
        sessionId: mode.sessionId,
        settingsContext,
      });
      return { db, paths, profiles, settings, settingsContext };
    } catch (error) {
      db.close();
      throw error;
    }
  }
  const settingsContext = prioritizeSettingsProfile(baseContext, mode.profile);
  const profiles = settingsProfileNames(settingsContext);
  const settings = loadSettings(root, {
    cwd: workspace,
    sessionId: mode.sessionId,
    settingsContext,
  });
  const paths = prepareWritableSession(mode);
  const db = new AgentDatabase(paths.dbPath);
  try {
    db.createSession(mode.sessionId, workspace, profiles);
    return { db, paths, profiles, settings, settingsContext };
  } catch (error) {
    db.close();
    throw error;
  }
}
function prepareWritableSession(mode: HostMode) {
  const planned = resolveSessionPaths(mode.sessionId);
  const exists = existsSync(planned.dir);
  if (mode.kind === "new" && exists) {
    throw sessionConflict(mode.sessionId);
  }
  if (mode.kind === "overwrite" && !exists) {
    throw sessionNotFound(mode.sessionId);
  }
  if (mode.kind === "overwrite") {
    removeDatabaseDirectory(planned.dir);
  }
  return sessionPaths(mode.sessionId);
}
function openLoadedDatabase(path: string, mode: HostMode, recoverInterrupted: boolean) {
  if (!existsSync(path)) {
    throw sessionNotFound(mode.sessionId);
  }
  const db = new AgentDatabase(path);
  try {
    if (!db.hasSession(mode.sessionId)) {
      throw sessionNotFound(mode.sessionId);
    }
    if (recoverInterrupted) {
      recoverHostSession(db, mode.sessionId);
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
