import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { localize } from "../../../i18n/server";
import { applicationAssetPath } from "../../applicationAssets";
import { readSettingsYamlValue } from "../placeholders";
import { userSettingsDirectory } from "./files";
import { settingsProfileNameSchema, settingsProfileNamesSchema } from "./profileNames";

export { settingsProfileNamesSchema } from "./profileNames";
interface SettingsProfile {
  directory: string;
  name: string;
}
export interface SettingsContext {
  defaultsDirectory: string;
  profiles: SettingsProfile[];
  root: string;
  userDirectory: string;
}
export function createSettingsContext(
  root = process.cwd(),
  userDirectory = userSettingsDirectory(),
  profileNames?: readonly string[],
): SettingsContext {
  const resolvedRoot = resolve(root),
    resolvedUserDirectory = resolve(userDirectory),
    selectionPath = resolve(resolvedUserDirectory, "profile.yaml"),
    names =
      profileNames ??
      (existsSync(selectionPath)
        ? settingsProfileNamesSchema.parse(readSettingsYamlValue(selectionPath))
        : []);
  return {
    defaultsDirectory: applicationAssetPath(resolvedRoot, "settings"),
    profiles: resolveProfiles(resolvedUserDirectory, names),
    root: resolvedRoot,
    userDirectory: resolvedUserDirectory,
  };
}
export function selectSettingsProfiles(
  context: SettingsContext,
  profileNames: readonly string[],
): SettingsContext {
  return {
    ...context,
    profiles: resolveProfiles(context.userDirectory, profileNames),
  };
}
export function prioritizeSettingsProfile(
  context: SettingsContext,
  profileName?: string,
): SettingsContext {
  if (profileName === undefined) {
    return context;
  }
  const name = settingsProfileNameSchema.parse(profileName),
    profileNames = [...settingsProfileNames(context).filter((current) => current !== name), name];
  return selectSettingsProfiles(context, profileNames);
}
export function availableSettingsProfiles(context: SettingsContext) {
  const directory = resolve(context.userDirectory, "profiles");
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => settingsProfileNameSchema.parse(entry.name))
    .toSorted((left, right) => left.localeCompare(right));
}
export function settingsProfileNames(context: SettingsContext) {
  return context.profiles.map(({ name }) => name);
}
function resolveProfiles(
  userDirectory: string,
  profileNames: readonly string[],
): SettingsProfile[] {
  return settingsProfileNamesSchema.parse(profileNames).map((name) => {
    const directory = resolve(userDirectory, "profiles", name);
    if (!existsSync(directory) || !statSync(directory).isDirectory()) {
      throw new Error(
        localize("configuration:settings.profileDirectoryMissing", {
          value0: directory,
        }),
      );
    }
    return { directory, name };
  });
}
