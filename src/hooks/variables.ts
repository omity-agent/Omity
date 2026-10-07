import type { HookToolOutput } from "./storage/outputs";
import { isPlainObject as isRecord } from "es-toolkit";
import { localize } from "../i18n/server";
import { resolvePlaceholders } from "../infrastructure/configuration/placeholders";

interface HookVariables {
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
const outputVariablePrefix = "toolOutputs.",
  outputVariablePattern =
    /^toolOutputs\.(?<order>fromEnd|fromStart)\.(?<ordinalText>[1-9]\d*)\.(?<field>output|structuredOutput)(?:\.(?<path>[^.]+(?:\.[^.]+)*))?$/;
export function resolveHookArgs(args: Record<string, unknown>, variables: HookVariables) {
  const resolved = resolvePlaceholders(args, {
    dynamic: (name) => hookVariableValue(name, variables),
    session: { cwd: variables.cwd, session: variables.session },
    source: localize("hooks:variables.argumentLabel"),
  });
  if (!isRecord(resolved)) {
    throw new Error(localize("hooks:variables.resultMustBeObject"));
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
    throw new Error(
      localize("hooks:variables.structuredOutputMissing", { value0: formatVariable(name) }),
    );
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
    throw new Error(localize("hooks:variables.formatInvalid", { value0: formatVariable(name) }));
  }
  const { field, order, ordinalText, path } = match.groups ?? {},
    ordinal = Number(ordinalText);
  if (
    (order !== "fromEnd" && order !== "fromStart") ||
    (field !== "output" && field !== "structuredOutput") ||
    !Number.isSafeInteger(ordinal)
  ) {
    throw new Error(localize("hooks:variables.indexInvalid", { value0: formatVariable(name) }));
  }
  return { field, order, ordinal, path: path?.split(".") ?? [] };
}
function selectOutput(
  name: string,
  reference: ToolOutputReference,
  outputs: readonly HookToolOutput[],
) {
  const index =
      reference.order === "fromStart" ? reference.ordinal - 1 : outputs.length - reference.ordinal,
    output = outputs[index];
  if (!output) {
    throw new Error(
      localize("hooks:variables.indexOutOfRange", {
        value0: formatVariable(name),
        value1: reference.ordinal.toString(),
        value2: outputs.length.toString(),
      }),
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
        throw new Error(
          localize("hooks:variables.fieldMissing", {
            value0: formatVariable(variable),
            value1: segment,
          }),
        );
      }
      current = current[index];
    } else if (isRecord(current) && Object.hasOwn(current, segment)) {
      current = current[segment];
    } else {
      throw new Error(
        localize("hooks:variables.pathFieldMissing", {
          value0: formatVariable(variable),
          value1: segment,
        }),
      );
    }
  }
  return current;
}
function formatVariable(name: string) {
  return `\${${name}}`;
}
