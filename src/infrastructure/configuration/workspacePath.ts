import { localize } from "../../i18n/server";
import { resolve } from "node:path";
import untildify from "untildify";

type Env = NodeJS.ProcessEnv;
export function normalizeWorkspacePath(
  input: string,
  base = process.cwd(),
  env: Env = process.env,
) {
  const stripped = stripOuterQuotes(input.trim());
  if (stripped.length === 0) {
    throw new Error(localize("configuration:workspace.empty"));
  }
  const expanded = expandEnvironmentVariables(stripped, env);
  return resolve(base, normalizeDriveRoot(untildify(expanded)), ".");
}
function stripOuterQuotes(value: string) {
  let current = value;
  while (current.length >= 2 && matchingQuotes(current)) {
    current = current.slice(1, -1).trim();
  }
  return current;
}
function matchingQuotes(value: string) {
  const [first] = value,
    last = value.at(-1);
  return (
    (first === '"' && last === '"') ||
    (first === "'" && last === "'") ||
    (first === "`" && last === "`")
  );
}
function expandEnvironmentVariables(value: string, env: Env) {
  return expandDollarVariables(expandPercentVariables(value, env), env);
}
function expandPercentVariables(value: string, env: Env) {
  return value.replaceAll(/%(?<name>[^%]+)%/g, (_, name: string) => envValue(name, env));
}
function expandDollarVariables(value: string, env: Env) {
  return value
    .replaceAll(/\$env:(?<name>[A-Za-z_][A-Za-z0-9_]*)/gi, (_, name: string) => envValue(name, env))
    .replaceAll(/\$\{(?<name>[A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name: string) => envValue(name, env))
    .replaceAll(/\$(?<name>[A-Za-z_][A-Za-z0-9_]*)/g, (_, name: string) => envValue(name, env));
}
function envValue(name: string, env: Env) {
  const value = env[name] ?? env[caseInsensitiveEnvName(name, env)];
  if (value === undefined) {
    throw new Error(localize("configuration:workspace.environmentMissing", { value0: name }));
  }
  return value;
}
function caseInsensitiveEnvName(name: string, env: Env) {
  const lower = name.toLowerCase();
  return Object.keys(env).find((key) => key.toLowerCase() === lower) ?? name;
}
function normalizeDriveRoot(value: string) {
  if (process.platform !== "win32") {
    return value;
  }
  return /^[A-Za-z]:$/.test(value) ? `${value}\\` : value;
}
