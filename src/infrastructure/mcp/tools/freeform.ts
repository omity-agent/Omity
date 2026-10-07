import { type SessionPlaceholders, resolvePlaceholders } from "../../configuration/placeholders";
import { hasSessionDescription, sessionDescription } from "./descriptions";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { localize } from "../../../i18n/server";
import { z } from "zod";

interface FreeformMcpTools {
  parameters: ReadonlyMap<string, string>;
}
const toolJsonSchema = z.looseObject({
    properties: z.record(z.string(), z.unknown()),
  }),
  stringParameterSchema = z.looseObject({ type: z.literal("string") });
export function configureFreeformMcpTools(
  tools: StructuredToolInterface[],
  names: string[],
): FreeformMcpTools {
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool])),
    parameters = new Map<string, string>();
  for (const name of names) {
    const tool = toolsByName.get(name);
    if (!tool) {
      throw new Error(localize("mcp:freeform.configuredToolMissing", { value0: name }));
    }
    parameters.set(name, singleStringParameter(tool));
  }
  return {
    parameters,
  };
}
export function sessionModelTools(
  tools: StructuredToolInterface[],
  _parameters: ReadonlyMap<string, string>,
  session: Required<SessionPlaceholders>,
) {
  return tools.map((tool) => {
    if (!hasSessionDescription(tool)) {
      return tool;
    }
    const description = resolveDescription(sessionDescription(tool), tool.name, session);
    tool.description = description;
    return tool;
  });
}
function singleStringParameter(tool: StructuredToolInterface) {
  const { schema } = tool,
    parsed = toolJsonSchema.safeParse(schema),
    entries = parsed.success ? Object.entries(parsed.data.properties) : [];
  if (entries.length !== 1) {
    throw new Error(
      localize("mcp:freeform.inputParameterCountInvalid", {
        value0: tool.name,
        value1: entries.length.toString(),
      }),
    );
  }
  const [entry] = entries;
  if (!entry) {
    throw new Error(localize("mcp:freeform.inputParameterMissing", { value0: tool.name }));
  }
  const [parameter, definition] = entry;
  if (!parameter) {
    throw new Error(localize("mcp:freeform.inputParameterNameMissing", { value0: tool.name }));
  }
  if (!stringParameterSchema.safeParse(definition).success) {
    throw new Error(
      localize("mcp:freeform.inputParameterTypeInvalid", {
        value0: tool.name,
        value1: parameter,
      }),
    );
  }
  return parameter;
}
function resolveDescription(
  description: string,
  name: string,
  session: Required<SessionPlaceholders>,
) {
  const resolved = resolvePlaceholders(description, {
    session,
    source: localize("mcp:freeform.descriptionLabel", { value0: name }),
  });
  if (typeof resolved !== "string") {
    throw new Error(localize("mcp:freeform.descriptionNotString", { value0: name }));
  }
  return resolved;
}
