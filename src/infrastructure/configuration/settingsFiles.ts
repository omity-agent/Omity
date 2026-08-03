import {
  type PlaceholderOptions,
  readSettingsYamlValue,
  resolvePlaceholders,
} from "./placeholders";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { config as loadDotenv } from "dotenv";
import untildify from "untildify";

export interface LayeredSettingsFile {
  path: string;
  value: unknown;
}
export function userDataDirectory() {
  return join(homedir(), ".omity");
}
export function userEnvironmentPath() {
  return join(userDataDirectory(), ".env");
}
export function loadUserEnvironment(path = userEnvironmentPath()) {
  if (!existsSync(path)) {
    return;
  }
  const result = loadDotenv({ override: false, path, quiet: true });
  if (result.error) {
    throw new Error(`无法加载用户环境变量文件：${path}`, { cause: result.error });
  }
}
export function userSettingsDirectory() {
  const configured = process.env["OMITY_SETTINGS_DIR"];
  return configured ? resolve(untildify(configured)) : join(userDataDirectory(), "settings");
}
export function readLayeredSettingsYaml(
  root: string,
  relativePath: string,
  placeholders: Omit<PlaceholderOptions, "source"> = {},
  userDirectory = userSettingsDirectory(),
): LayeredSettingsFile | undefined {
  const defaultPath = resolve(root, "settings", relativePath);
  const userPath = resolve(userDirectory, relativePath);
  const hasDefault = existsSync(defaultPath);
  const hasUser = existsSync(userPath);
  if (!hasDefault && !hasUser) {
    return undefined;
  }
  const defaults = hasDefault ? readSettingsYamlValue(defaultPath) : undefined;
  if (!hasUser) {
    return {
      path: defaultPath,
      value: resolvePlaceholders(defaults, { ...placeholders, source: defaultPath }),
    };
  }
  const overrides = readSettingsYamlValue(userPath);
  return {
    path: userPath,
    value: resolvePlaceholders(hasDefault ? mergeSettings(defaults, overrides) : overrides, {
      ...placeholders,
      source: userPath,
    }),
  };
}
export function resolveLayeredSettingsText(
  root: string,
  relativePath: string,
  userDirectory = userSettingsDirectory(),
) {
  const userPath = resolve(userDirectory, relativePath);
  return existsSync(userPath) ? userPath : resolve(root, "settings", relativePath);
}
function mergeSettings(defaults: unknown, overrides: unknown): unknown {
  if (!isRecord(defaults) || !isRecord(overrides)) {
    return overrides;
  }
  const keys = new Set([...Object.keys(defaults), ...Object.keys(overrides)]);
  return Object.fromEntries(
    [...keys].map((key) => [
      key,
      Object.hasOwn(overrides, key) ? mergeSettings(defaults[key], overrides[key]) : defaults[key],
    ]),
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
