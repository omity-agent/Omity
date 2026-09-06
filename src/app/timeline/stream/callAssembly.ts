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
}
export function beginToolPart(delta: ToolDelta): ToolPart {
  const args = delta.argumentsDelta ?? "";
  return {
    args,
    argumentEnds: args ? [args.length] : [],
    ...(delta.freeform ? { freeform: true } : {}),
    ...(delta.idDelta ? { id: delta.idDelta } : {}),
    index: delta.index,
    kind: "tool_call_delta",
    name: delta.nameDelta ?? "",
  };
}
export function extendToolPart(part: ToolPart, delta: ToolDelta) {
  if (part.index !== delta.index) {
    throw new Error("工具流片段的索引发生变化");
  }
  part.args += delta.argumentsDelta ?? "";
  part.freeform ??= delta.freeform;
  if (delta.idDelta) {
    part.id = (part.id ?? "") + delta.idDelta;
  }
  part.name += delta.nameDelta ?? "";
  if (delta.argumentsDelta) {
    part.argumentEnds.push(part.args.length);
  }
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
