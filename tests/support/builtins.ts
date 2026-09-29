import { join, resolve } from "node:path";
import { deepmerge } from "deepmerge-ts";
import { readMcpConfiguration } from "../../src/infrastructure/mcp/configuration";
import { stringify } from "yaml";
import { writeFileSync } from "node:fs";

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
