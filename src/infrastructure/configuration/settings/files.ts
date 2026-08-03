import {
  type PlaceholderOptions,
  readSettingsYamlValue,
  resolvePlaceholders,
} from "../placeholders";
import { dirname, join, resolve } from "node:path";
import type { SettingsContext } from "./context";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { config as loadDotenv } from "dotenv";
import untildify from "untildify";

export interface LayeredSettingsFile {
  path: string;
  value: unknown;
}
export type SettingsScope = "global" | "profile";
type OverrideTransform = (value: unknown, override: unknown, directory: string) => unknown;
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
  context: SettingsContext,
  scope: SettingsScope,
  relativePath: string,
  placeholders: Omit<PlaceholderOptions, "source"> = {},
  transformOverride?: OverrideTransform,
): LayeredSettingsFile | undefined {
  const defaultPath = resolve(context.defaultsDirectory, relativePath);
  const overrideDirectories =
    scope === "global"
      ? [context.userDirectory]
      : context.profiles.map(({ directory }) => directory);
  const layers = [
    { override: false, path: defaultPath },
    ...overrideDirectories.map((directory) => ({
      override: true,
      path: resolve(directory, relativePath),
    })),
  ].filter(({ path }) => existsSync(path));
  if (layers.length === 0) {
    return undefined;
  }
  let value: unknown;
  for (const [index, layer] of layers.entries()) {
    const raw = readSettingsYamlValue(layer.path);
    value = index === 0 ? raw : mergeSettings(value, raw);
  }
  const source = layers.at(-1)?.path;
  if (!source) {
    throw new Error(`配置层解析失败：${relativePath}`);
  }
  let resolved = resolvePlaceholders(value, {
    ...placeholders,
    source,
  });
  if (transformOverride) {
    for (const layer of layers.toReversed()) {
      if (layer.override) {
        resolved = transformOverride(
          resolved,
          readSettingsYamlValue(layer.path),
          dirname(layer.path),
        );
      }
    }
  }
  return {
    path: source,
    value: resolved,
  };
}
export function resolveLayeredSettingsText(
  context: SettingsContext,
  scope: SettingsScope,
  relativePath: string,
) {
  const directories =
    scope === "global"
      ? [context.defaultsDirectory, context.userDirectory]
      : [context.defaultsDirectory, ...context.profiles.map(({ directory }) => directory)];
  return (
    directories
      .map((directory) => resolve(directory, relativePath))
      .findLast((path) => existsSync(path)) ?? resolve(context.defaultsDirectory, relativePath)
  );
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
