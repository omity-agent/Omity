import type { HookToolOutput } from "./storage/outputs";
import { resolvePlaceholders } from "../infrastructure/configuration/placeholders";

export interface HookVariables {
  cwd: string;
  session?: string;
  toolOutputs: readonly HookToolOutput[];
}
type ToolOutputField = "output" | "structuredOutput";
type ToolOutputOrder = "fromEnd" | "fromStart";
interface ToolOutputReference {
  field: ToolOutputField;
  order: ToolOutputOrder;
  ordinal: number;
  path: string[];
}
const outputVariablePrefix = "toolOutputs.";
const outputVariablePattern =
  /^toolOutputs\.(?<order>fromEnd|fromStart)\.(?<ordinalText>[1-9]\d*)\.(?<field>output|structuredOutput)(?:\.(?<path>[^.]+(?:\.[^.]+)*))?$/;
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
export function isHookOutputVariable(name: string) {
  return parseOutputReference(name) !== undefined;
}
function hookVariableValue(name: string, variables: HookVariables) {
  const reference = parseOutputReference(name);
  if (!reference) {
    return { matched: false };
  }
  const output = selectOutput(name, reference, variables.toolOutputs);
  if (reference.field === "structuredOutput" && !(reference.field in output)) {
    throw new Error(`Hook 变量 \${${name}} 引用的工具没有结构化输出`);
  }
  const value = output[reference.field];
  return {
    matched: true,
    value: reference.path.length > 0 ? readPath(value, reference.path, name) : value,
  };
}
function parseOutputReference(name: string): ToolOutputReference | undefined {
  if (!name.startsWith(outputVariablePrefix)) {
    return undefined;
  }
  const match = outputVariablePattern.exec(name);
  if (!match) {
    throw new Error(
      `Hook 工具输出变量格式无效：\${${name}}；应使用 \${toolOutputs.fromStart.N.output} 或 \${toolOutputs.fromEnd.N.structuredOutput}`,
    );
  }
  const { field, order, ordinalText, path } = match.groups ?? {};
  const ordinal = Number(ordinalText);
  if (
    (order !== "fromEnd" && order !== "fromStart") ||
    (field !== "output" && field !== "structuredOutput") ||
    !Number.isSafeInteger(ordinal)
  ) {
    throw new Error(`Hook 工具输出变量索引无效：\${${name}}`);
  }
  return { field, order, ordinal, path: path?.split(".") ?? [] };
}
function selectOutput(
  name: string,
  reference: ToolOutputReference,
  outputs: readonly HookToolOutput[],
) {
  const index =
    reference.order === "fromStart" ? reference.ordinal - 1 : outputs.length - reference.ordinal;
  const output = outputs[index];
  if (!output) {
    throw new Error(
      `Hook 变量 \${${name}} 超出工具输出范围：请求第 ${reference.ordinal.toString()} 个，当前共有 ${outputs.length.toString()} 个`,
    );
  }
  return output;
}
function readPath(value: unknown, path: string[], variable: string): unknown {
  let current = value;
  for (const segment of path) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (
        !/^\d+$/.test(segment) ||
        !Number.isSafeInteger(index) ||
        !Object.hasOwn(current, index)
      ) {
        throw new Error(`Hook 变量 \${${variable}} 的字段不存在：${segment}`);
      }
      current = current[index];
    } else if (isRecord(current) && Object.hasOwn(current, segment)) {
      current = current[segment];
    } else {
      throw new Error(`Hook 变量 \${${variable}} 的字段不存在：${segment}`);
    }
  }
  return current;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
