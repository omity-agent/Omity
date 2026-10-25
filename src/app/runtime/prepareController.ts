import {
  availableSettingsProfiles,
  createSettingsContext,
  type SettingsContext,
} from "../../infrastructure/configuration/settings/context";
import { loadSettings } from "../../infrastructure/configuration/settings/load";
import type { ProcessOwner } from "../../infrastructure/process/ownership";
import type { Settings } from "../../types";
import type { BootstrapResponse } from "../contracts/results";
import { AppRegistry } from "../registry";
import type { SessionInfo } from "../sessionState";
import type { AppInstanceOwner } from "./instanceLock";
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
): BootstrapResponse {
  return {
    attachments: settings.attachments,
    cwd,
    frontend: settings.frontend,
    profiles: { available: availableSettingsProfiles(context) },
    sessions,
  };
}
