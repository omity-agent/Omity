import { join, resolve } from "node:path";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { deepmerge } from "deepmerge-ts";
import { readMcpConfiguration } from "../../src/infrastructure/mcp/configuration";
import { stringify } from "yaml";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { writeFileSync } from "node:fs";
import { z } from "zod";

function repositoryToolbox() {
  return readMcpConfiguration(resolve(import.meta.dir, "../../settings/toolbox.yaml"));
}
export function defaultBuiltIns() {
  return repositoryToolbox().toolboxes;
}
export function writeToolboxConfiguration(root: string, overrides: Record<string, unknown> = {}) {
  writeFileSync(
    join(root, "settings", "toolbox.yaml"),
    stringify(deepmerge(repositoryToolbox(), overrides)),
  );
}
export function toolProperties(tool: StructuredToolInterface) {
  return z
    .object({ properties: z.record(z.string(), z.unknown()) })
    .parse(toJsonSchema(tool.schema)).properties;
}
