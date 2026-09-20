import type { DisplayEvent } from "../contracts/projection";
import { parseToolInput } from "../../../fileLinks/toolInput";

type ToolDelta = Extract<DisplayEvent, { kind: "tool_call_delta" }>["value"];
export interface ToolPart {
  args: string;
  argumentEnds: number[];
  formal?: true;
  freeform?: boolean;
  id?: string;
  index: number;
  kind: "tool_call_delta";
  name: string;
  providerExecuted?: true;
}
export function beginToolPart(delta: ToolDelta): ToolPart {
  const args = delta.argumentsText ?? delta.argumentsDelta ?? "";
  return {
    args,
    argumentEnds: args ? [args.length] : [],
    ...(delta.freeform ? { freeform: true } : {}),
    ...(delta.idDelta ? { id: delta.idDelta } : {}),
    index: delta.index,
    kind: "tool_call_delta",
    name: delta.nameDelta ?? "",
    ...(delta.providerExecuted ? { providerExecuted: true } : {}),
  };
}
export function extendToolPart(part: ToolPart, delta: ToolDelta) {
  if (part.index !== delta.index) {
    throw new Error("工具流片段的索引发生变化");
  }
  if (delta.argumentsText !== undefined) {
    part.args = delta.argumentsText;
    part.argumentEnds = part.args ? [part.args.length] : [];
  } else {
    part.args += delta.argumentsDelta ?? "";
    if (delta.argumentsDelta) {
      part.argumentEnds.push(part.args.length);
    }
  }
  part.freeform ??= delta.freeform;
  part.providerExecuted ??= delta.providerExecuted;
  if (delta.idDelta) {
    part.id = (part.id ?? "") + delta.idDelta;
  }
  part.name += delta.nameDelta ?? "";
}
export function latestParsedInput(part: ToolPart) {
  if (part.freeform) {
    return undefined;
  }
  for (let index = part.argumentEnds.length - 1; index >= 0; index -= 1) {
    const input = parseToolInput(part.args.slice(0, part.argumentEnds[index]));
    if (input !== undefined) {
      return input;
    }
  }
  return undefined;
}
