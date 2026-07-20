import { resolvePlaceholders } from "../infrastructure/configuration/placeholders";

export interface HookVariables {
  cwd: string;
  session?: string;
  previousTool?: {
    output: unknown;
    structuredOutput?: unknown;
  };
}
export function resolveHookArgs(args: Record<string, unknown>, variables: HookVariables) {
  const resolved = resolvePlaceholders(args, {
    dynamic: (name) => hookVariableValue(name, variables),
    session: { cwd: variables.cwd, session: variables.session },
    source: "Hook 参数",
  });
  if (!isRecord(resolved)) {
    throw new Error("Hook 参数解析结果必须是对象");
  }
  return resolved;
}
function hookVariableValue(name: string, variables: HookVariables) {
  const output = readPreviousToolValue(name, "output", variables);
  if (output.matched) {
    return output;
  }
  const structured = readPreviousToolValue(name, "structuredOutput", variables);
  if (structured.matched) {
    return structured;
  }
  return { matched: false };
}
function readPreviousToolValue(
  name: string,
  field: "output" | "structuredOutput",
  variables: HookVariables,
): { matched: boolean; value?: unknown } {
  const variable = `previousTool.${field}`;
  if (name !== variable && !name.startsWith(`${variable}.`)) {
    return { matched: false };
  }
  const previous = variables.previousTool;
  if (!previous) {
    throw new Error(`Hook 变量 \${${variable}} 没有可用的前序工具输出`);
  }
  if (field === "structuredOutput" && !(field in previous)) {
    throw new Error(`Hook 变量 \${${variable}} 没有可用的结构化输出`);
  }
  const path = name.slice(variable.length + 1);
  const value = previous[field];
  return {
    matched: true,
    value: path ? readPath(value, path.split("."), name) : value,
  };
}
function readPath(value: unknown, path: string[], variable: string): unknown {
  let current = value;
  for (const segment of path) {
    if (isRecord(current) && segment in current) {
      current = current[segment];
    } else if (Array.isArray(current) && /^\d+$/.test(segment)) {
      current = current[Number(segment)];
    } else {
      throw new Error(`Hook 变量 \${${variable}} 的字段不存在：${segment}`);
    }
  }
  return current;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
