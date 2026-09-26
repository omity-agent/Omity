import {
  agentSettingsSchema,
  mainSettingsSchema,
} from "../../../src/infrastructure/configuration/settings/schema";
import { expect, test } from "bun:test";
import { hooksFileSchema } from "../../../src/infrastructure/configuration/hookRules";
import { isPlainObject as isRecord } from "es-toolkit";
import { modelSettingsSchema } from "../../../src/infrastructure/configuration/settings/models";
import { readSettingsYamlValue } from "../../../src/infrastructure/configuration/placeholders";
import { resolve } from "node:path";
import { toolboxSchema } from "../../../src/infrastructure/mcp/configuration/declaration";
import { z } from "zod";

test.each([
  ["main.yaml", mainSettingsSchema],
  ["agent.yaml", agentSettingsSchema],
  ["model.yaml", modelSettingsSchema],
  ["hooks.yaml", hooksFileSchema],
  ["toolbox.yaml", toolboxSchema],
] as const)("repository %s explicitly lists every schema field", (file, schema) => {
  const value = readSettingsYamlValue(resolve(import.meta.dir, "../../..", "settings", file)),
    declaration = z.toJSONSchema(schema, { io: "input" });
  expect(isRecord(value)).toBe(true);
  expect(missingFields(value, declaration, file)).toEqual([]);
});
test("coverage includes optional fields and nested discriminated branches", () => {
  const schema = z.toJSONSchema(
    z.object({
      nested: z.discriminatedUnion("type", [
        z.object({ first: z.string(), type: z.literal("a") }),
        z.object({ second: z.string(), type: z.literal("b") }),
      ]),
      optional: z.string().optional(),
    }),
    { io: "input" },
  );
  expect(missingFields({ nested: { type: "a" } }, schema, "test").toSorted()).toEqual([
    "test.nested.first",
    "test.nested.second",
    "test.optional",
  ]);
});
function missingFields(value: unknown, schema: unknown, path: string): string[] {
  if (!isRecord(schema)) {
    return [];
  }
  const missing: string[] = [];
  for (const key of ["anyOf", "oneOf", "allOf"]) {
    const branches = schema[key];
    if (Array.isArray(branches)) {
      missing.push(...branches.flatMap((branch) => missingFields(value, branch, path)));
    }
  }
  if (Array.isArray(value)) {
    missing.push(
      ...value.flatMap((item, index) => missingFields(item, schema["items"], `${path}[${index}]`)),
    );
  } else if (isRecord(value)) {
    const { properties } = schema;
    if (isRecord(properties)) {
      for (const [key, child] of Object.entries(properties)) {
        const childPath = `${path}.${key}`;
        missing.push(
          ...(Object.hasOwn(value, key)
            ? missingFields(value[key], child, childPath)
            : [childPath]),
        );
      }
    } else if (isRecord(schema["additionalProperties"])) {
      for (const [key, item] of Object.entries(value)) {
        missing.push(...missingFields(item, schema["additionalProperties"], `${path}.${key}`));
      }
    }
  }
  return [...new Set(missing)];
}
