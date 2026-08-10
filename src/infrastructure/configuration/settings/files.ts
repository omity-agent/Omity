import {
  type PlaceholderOptions,
  readSettingsYamlFile,
  resolvePlaceholders,
} from "../placeholders";
import { dirname, join, resolve } from "node:path";
import { existsSync, statSync } from "node:fs";
import type { SettingsContext } from "./context";
import { homedir } from "node:os";
import { config as loadDotenv } from "dotenv";
import untildify from "untildify";

export interface LayeredSettingsFile {
  path: string;
  value: unknown;
}
export type SettingsScope = "global" | "profile";
type OverrideTransform = (value: unknown, override: unknown, directory: string) => unknown;
interface LayeredSettingsTransforms {
  beforePlaceholders?: (value: unknown) => unknown;
  override?: OverrideTransform;
}
export function userDataDirectory() {
  const configured = process.env["OMITY_HOME"];
  return configured ? resolve(untildify(configured)) : join(homedir(), ".omity");
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
  return join(userDataDirectory(), "settings");
}
export function readLayeredSettingsYaml(
  context: SettingsContext,
  scope: SettingsScope,
  relativePath: string,
  placeholders: Omit<PlaceholderOptions, "source"> = {},
  transforms: LayeredSettingsTransforms = {},
): LayeredSettingsFile | undefined {
  const defaultPath = resolve(context.defaultsDirectory, relativePath),
    overrideDirectories =
      scope === "global"
        ? [context.userDirectory]
        : context.profiles.map(({ directory }) => directory),
    layers = [
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
    const raw = readSettingsLayer(layer.path);
    value = index === 0 ? raw : mergeSettings(value, raw);
  }
  const source = layers.at(-1)?.path;
  if (!source) {
    throw new Error(`配置层解析失败：${relativePath}`);
  }
  const prepared = transforms.beforePlaceholders ? transforms.beforePlaceholders(value) : value;
  let resolved = resolvePlaceholders(prepared, {
    ...placeholders,
    source,
  });
  if (transforms.override) {
    for (const layer of layers.toReversed()) {
      if (layer.override) {
        resolved = transforms.override(
          resolved,
          readSettingsLayer(layer.path),
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
        : [context.defaultsDirectory, ...context.profiles.map(({ directory }) => directory)],
    path = directories
      .map((directory) => resolve(directory, relativePath))
      .findLast((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  if (!path) {
    throw new Error(`文本配置文件不存在：${relativePath}`);
  }
  return path;
}
function readSettingsLayer(path: string) {
  const file = readSettingsYamlFile(path);
  return file.empty ? {} : file.value;
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
