import {
  type SettingsContext,
  availableSettingsProfiles,
  createSettingsContext,
} from "../../infrastructure/configuration/settings/context";
import type { AppInstanceOwner } from "./instanceLock";
import { AppRegistry } from "../registry";
import type { ProcessOwner } from "../../infrastructure/process/ownership";
import type { SessionInfo } from "../sessionState";
import type { Settings } from "../../types";
import { loadSettings } from "../../infrastructure/configuration/settings/load";
import { recoverAppSessions } from "./recovery";

export interface ControllerOptions {
  abandonedOwner?: AppInstanceOwner;
  owner?: ProcessOwner;
  settingsContext?: SettingsContext;
}
export function prepareController(root: string, options: ControllerOptions) {
  const settingsContext = options.settingsContext ?? createSettingsContext(root),
    settings = loadSettings(root, { settingsContext }),
    registry = new AppRegistry();
  try {
    recoverAppSessions(registry.list(), options.abandonedOwner);
    registry.reload();
    return { registry, settings, settingsContext };
  } catch (error) {
    registry.close();
    throw error;
  }
}
export function bootstrapPayload(
  cwd: string,
  settings: Settings,
  context: SettingsContext,
  sessions: SessionInfo[],
) {
  return {
    attachments: settings.attachments,
    cwd,
    frontend: settings.frontend,
    profiles: { available: availableSettingsProfiles(context) },
    sessions,
  };
}
