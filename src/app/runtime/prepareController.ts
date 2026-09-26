import {
  type SettingsContext,
  availableSettingsProfiles,
  createSettingsContext,
} from "../../infrastructure/configuration/settings/context";
import type { AppInstanceOwner } from "./instanceLock";
import { AppRegistry } from "../registry";
import type { ProcessOwner } from "../../infrastructure/process/ownership";
import { RetainedRegistry } from "./resources/retainedRegistry";
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
    discovered = new AppRegistry();
  recoverAppSessions(discovered.list(), options.abandonedOwner);
  return { registry: new RetainedRegistry(), settings, settingsContext };
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
