import { existsSync, readdirSync, statSync } from "node:fs";
import { applicationAssetPath } from "../../applicationAssets";
import { readSettingsYamlValue } from "../placeholders";
import { resolve } from "node:path";
import { userSettingsDirectory } from "./files";
import { z } from "zod";

export const settingsProfileNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u);
export const settingsProfileNamesSchema = z
  .array(settingsProfileNameSchema)
  .superRefine((names, context) => {
    if (new Set(names).size !== names.length) {
      context.addIssue({
        code: "custom",
        message: "Profile 列表不能包含重复项",
      });
    }
  });
export interface SettingsProfile {
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
  const resolvedRoot = resolve(root);
  const resolvedUserDirectory = resolve(userDirectory);
  const selectionPath = resolve(resolvedUserDirectory, "profile.yaml");
  const names =
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
  const name = settingsProfileNameSchema.parse(profileName);
  const profileNames = [
    ...settingsProfileNames(context).filter((current) => current !== name),
    name,
  ];
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
      throw new Error(`Profile 配置目录不存在：${directory}`);
    }
    return { directory, name };
  });
}
