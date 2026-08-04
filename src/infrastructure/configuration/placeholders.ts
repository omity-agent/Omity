import { parse, parseAllDocuments } from "yaml";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";

const exactPlaceholder = /^\$\{(?<name>[^}]+)\}$/;
const embeddedPlaceholder = /\$\{(?<name>[^}]+)\}/g;
const environmentName = /^[A-Za-z_][A-Za-z0-9_]*$/;
export interface SessionPlaceholders {
  cwd?: string;
  session?: string;
}
interface PlaceholderResolution {
  matched: boolean;
  value?: unknown;
}
export interface PlaceholderOptions {
  deferSession?: boolean;
  deferred?: (name: string) => boolean;
  dynamic?: (name: string) => PlaceholderResolution;
  session?: SessionPlaceholders;
  source: string;
}
export function readSettingsText(path: string, options: Omit<PlaceholderOptions, "source">) {
  const value = resolveString(readFileSync(path, "utf8"), { ...options, source: path });
  if (typeof value !== "string") {
    throw new Error(`文本配置 ${path} 的占位符必须解析为字符串`);
  }
  return value;
}
export function readSettingsYaml(path: string, options: Omit<PlaceholderOptions, "source"> = {}) {
  const { value } = readSettingsYamlFile(path);
  return resolvePlaceholders(value, { ...options, source: path });
}
export function readSettingsYamlValue(path: string): unknown {
  return readSettingsYamlFile(path).value;
}
export function readSettingsYamlFile(path: string) {
  const source = readFileSync(path, "utf8");
  return {
    empty: "empty" in parseAllDocuments(source),
    value: parse(source) as unknown,
  };
}
export function resolvePlaceholders(value: unknown, options: PlaceholderOptions): unknown {
  if (typeof value === "string") {
    return resolveString(value, options);
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      resolvePlaceholders(item, {
        ...options,
        source: `${options.source}[${index.toString()}]`,
      }),
    );
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      resolvePlaceholders(item, {
        ...options,
        source: `${options.source}.${key}`,
      }),
    ]),
  );
}
export function appDataRoot() {
  if (process.platform === "win32") {
    const path = process.env["APPDATA"];
    if (!path) {
      throw new Error("缺少环境变量 APPDATA，无法定位用户 AppData 目录");
    }
    return path;
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support");
  }
  return process.env["XDG_DATA_HOME"] ?? join(homedir(), ".local", "share");
}
function resolveString(value: string, options: PlaceholderOptions) {
  const exact = exactPlaceholder.exec(value);
  if (exact) {
    const name = requireName(exact);
    const resolved = resolveVariable(name, options);
    return resolved.matched ? resolved.value : value;
  }
  return value.replace(embeddedPlaceholder, (placeholder, name: string) => {
    const resolved = resolveVariable(name, options);
    if (!resolved.matched) {
      return placeholder;
    }
    if (!isScalar(resolved.value)) {
      throw new Error(`${options.source} 的占位符 ${placeholder} 不能将数组或对象嵌入字符串`);
    }
    return String(resolved.value);
  });
}
function resolveVariable(name: string, options: PlaceholderOptions): PlaceholderResolution {
  if (name === "appData") {
    return { matched: true, value: appDataRoot() };
  }
  if (name === "cwd" || name === "session") {
    const value = options.session?.[name];
    if (value !== undefined) {
      return { matched: true, value };
    }
    if (options.deferSession) {
      return { matched: false };
    }
    throw new Error(`${options.source} 的会话占位符 \${${name}} 没有可用值`);
  }
  const dynamic = options.dynamic?.(name);
  if (dynamic?.matched) {
    return dynamic;
  }
  if (options.deferred?.(name)) {
    return { matched: false };
  }
  if (environmentName.test(name)) {
    const value = process.env[name];
    if (value === undefined) {
      throw new Error(`${options.source} 引用了未设置的环境变量 ${name}`);
    }
    return { matched: true, value };
  }
  throw new Error(`${options.source} 引用了未知占位符：\${${name}}`);
}
function requireName(match: RegExpExecArray) {
  const name = match.groups?.["name"];
  if (!name) {
    throw new Error(`无效占位符：${match[0]}`);
  }
  return name;
}
function isScalar(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
