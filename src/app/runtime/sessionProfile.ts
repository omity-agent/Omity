import { sessionProfileBusy } from "../../errors";
import {
  prioritizeSettingsProfile,
  selectSettingsProfiles,
  type SettingsContext,
  settingsProfileNames,
} from "../../infrastructure/configuration/settings/context";
import { loadSettings } from "../../infrastructure/configuration/settings/load";
import { readDefinitionRecord } from "../../infrastructure/database/records/session/metadata";
import { writeSessionConfigurationRecord } from "../../infrastructure/database/records/session/sessionConfiguration";
import {
  refreshSessionDefinition,
  type SessionDefinition,
} from "../../infrastructure/database/session/sessionDefinition";
import { openStoredSession } from "../../storedSessions";
import { isRunningStatus, type SessionStatus } from "../../types";
import type { SessionInfo } from "../events/contracts";

function prepareSessionProfile(options: {
  baseContext: SettingsContext;
  currentProfiles: readonly string[];
  definition: SessionDefinition;
  profile?: string;
  root: string;
  sessionId: string;
  workspace: string;
}) {
  const settingsContext =
      options.profile === undefined
        ? options.baseContext
        : prioritizeSettingsProfile(
            selectSettingsProfiles(options.baseContext, options.currentProfiles),
            options.profile,
          ),
    profiles = settingsProfileNames(settingsContext),
    settings = loadSettings(options.root, {
      cwd: options.workspace,
      sessionId: options.sessionId,
      settingsContext,
    });
  return {
    definition: refreshSessionDefinition(settings, options.definition),
    profiles,
  };
}
export async function updateSessionProfile(options: {
  baseContext: SettingsContext;
  clearError: () => void;
  currentProfiles: readonly string[];
  isBound: () => boolean;
  profile?: string;
  readSession: () => SessionInfo;
  restart: () => void;
  root: string;
  sessionId: string;
  sessionStatus: SessionStatus;
  stop: () => Promise<void>;
  workspace: string;
}) {
  if (isRunningStatus(options.sessionStatus)) {
    throw sessionProfileBusy(options.sessionId);
  }
  const restart = options.isBound();
  await options.stop();
  try {
    using database = openStoredSession(options.sessionId);
    const next = prepareSessionProfile({
      baseContext: options.baseContext,
      currentProfiles: options.currentProfiles,
      definition: readDefinitionRecord(database.db, options.sessionId),
      profile: options.profile,
      root: options.root,
      sessionId: options.sessionId,
      workspace: options.workspace,
    });
    writeSessionConfigurationRecord(database.db, options.sessionId, next.profiles, next.definition);
    options.clearError();
    if (restart) {
      options.restart();
    }
    return options.readSession();
  } catch (error) {
    if (restart) {
      options.restart();
    }
    throw error;
  }
}
