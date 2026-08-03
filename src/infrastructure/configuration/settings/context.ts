import { existsSync, statSync } from "node:fs";
import { applicationAssetPath } from "../../applicationAssets";
import { readSettingsYamlValue } from "../placeholders";
import { resolve } from "node:path";
import { userSettingsDirectory } from "./files";
import { z } from "zod";

const profileNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u);
const profileSelectionSchema = z.array(profileNameSchema).superRefine((names, context) => {
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
): SettingsContext {
  const resolvedRoot = resolve(root);
  const resolvedUserDirectory = resolve(userDirectory);
  const selectionPath = resolve(resolvedUserDirectory, "profile.yaml");
  const profiles = existsSync(selectionPath)
    ? resolveProfiles(resolvedUserDirectory, selectionPath)
    : [];
  return {
    defaultsDirectory: applicationAssetPath(resolvedRoot, "settings"),
    profiles,
    root: resolvedRoot,
    userDirectory: resolvedUserDirectory,
  };
}
function resolveProfiles(userDirectory: string, selectionPath: string): SettingsProfile[] {
  return profileSelectionSchema.parse(readSettingsYamlValue(selectionPath)).map((name) => {
    const directory = resolve(userDirectory, "profiles", name);
    if (!existsSync(directory) || !statSync(directory).isDirectory()) {
      throw new Error(`Profile 配置目录不存在：${directory}`);
    }
    return { directory, name };
  });
}
